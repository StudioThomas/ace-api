const _ = require('lodash');
const Promise = require('bluebird');
const jsonQuery = require('json-query');
const { diff } = require('deep-diff');
const ClientConfig = require('./client-config');
const Db = require('./db');
const Helpers = require('./helpers');
const Schema = require('./schema');
const Assist = require('./assist');

const CHUNK_UPDATE_SIZE = 1000;

class Entity {
  constructor(config) {
    this.config = config;

    // Expose helpers
    this.flattenValues = Entity.flattenValues;
  }

  static flattenValues(docs) {
    return docs.map(doc => {
      if (!doc.fields || !_.size(doc.fields)) {
        return doc;
      }

      doc.fields = _.mapValues(doc.fields, field => {
        if (/entity/.test(field.type) && _.isArray(field.value)) {
          // entity / entityTile / entityGrid
          field.value = Entity.flattenValues(field.value);
        }
        return field.value;
      });

      return doc;
    });
  }

  static _filterEntityFields(docs, role = 'guest') {
    const isArray = _.isArray(docs);

    docs = (isArray ? docs : [docs]).map(doc => {
      if (_.size(doc.fields)) {
        doc.fields = _.mapValues(doc.fields, field => {
          if (_.isArray(field.value)) {
            field.value = field.value.filter(obj => {
              if (!obj) {
                return false;
              }
              if (obj.type && obj.type === 'entity' && role === 'guest') {
                return obj.published !== undefined ? obj.published : true;
              }
              return true;
            });
          }
          return field;
        });
      }
      return doc;
    });

    return isArray ? docs : docs[0];
  }

  static _appendChildren(docs, childrenMap) {
    return docs.map(doc => {
      if (!_.size(doc.fields)) {
        return doc;
      }

      doc.fields = _.mapValues(doc.fields, field => {
        if (_.isArray(field.value)) {
          field.value = field.value.filter(obj => {
            if (!obj) {
              return false;
            }
            if (obj.type === 'entity') {
              return childrenMap[obj.id] !== undefined;
            }
            return true;
          });

          field.value = field.value.map(obj => {
            if (obj.type === 'entity') {
              obj = _.merge(obj, childrenMap[obj.id]);
            }
            obj = _.omitBy(obj, (value, key) => key.startsWith('_'));
            return obj;
          });
        }

        return field;
      });

      return doc;
    });
  }

  static _appendParents(rows, parents = null, role = 'guest') {
    let entityMap = {};

    rows.forEach(row => {
      if (row.doc && row.value.type === 'entity') {
        entityMap[row.id] = { ...row.doc, parents: [] };
      }
    });

    if (parents) {
      rows.forEach(row => {
        if (row.doc && row.value.type === 'parent') {
          entityMap[row.key].parents.push(
            Entity._filterEntityFields(row.doc, role)
          );
        }
      });

      entityMap = _.mapValues(entityMap, entity => {
        entity.parents = _.uniqBy(entity.parents, entity => entity._id);
        return entity;
      });
    }

    rows = rows.map(row => {
      row.doc = entityMap[row.id];
      return row;
    });

    rows = rows.filter(row => row.value.type === 'entity');

    return rows;
  }

  static _fileNames(entities) {
    const fileNames = [];

    entities.forEach(entity => {
      _.forEach(entity.fields, field => {
        if (field.value && field.value.file) {
          fileNames.push(field.value.file.name);
        }
      });
    });

    return _.uniq(fileNames);
  }

  async fieldValues(fieldSlug, searchTerm) {
    const result = await Db.connect(this.config).viewWithList(
      'entity',
      'byField',
      'search',
      {
        startkey: [fieldSlug],
        endkey: [fieldSlug, {}],
        group: true,
        searchTerm,
      }
    );
    return result;
  }

  static _query(data, query, isFieldQuery = false) {
    query = query.replace(/(\s\s|\t|\r|\n)/g, '');

    if (isFieldQuery) {
      const queryParts = query.trim().split(/\[|\]/);
      const selector = `fields.${queryParts[0]}.value[${queryParts[1] || '*'}]`;
      const modifier = /\]:/.test(query)
        ? `:${query
            .split(/\]:/)
            .slice(-1)[0]
            .trim()}`
        : '';
      query = `${selector}${modifier}`;
    }

    const result = jsonQuery(query, {
      data,
      locals: {
        slice: (input, start, end) => _.slice(input, start, end),
        sample: (input, size = 1) => _.sampleSize(input, size),
        group: (entities, groupSize = Infinity) => {
          const grouped = [];

          let group = [];

          entities.forEach(entity => {
            if (!entity.groupBefore || group.length >= groupSize) {
              group = [];
            }

            group.push(entity);

            if (!entity.groupAfter || group.length >= groupSize) {
              group.ratio = 0;

              group.forEach(entity => {
                group.ratio += (entity.thumbnail || entity).ratio;
              });

              group.forEach(entity => {
                entity.groupRatio =
                  (entity.thumbnail || entity).ratio / group.ratio;
              });

              grouped.push(group);
            }
          });

          return grouped;
        },
        pick: (input, ...paths) =>
          _.map(input, obj => {
            const copy = {
              id: obj.id || undefined,
            };
            paths = paths.filter(path => path); // Remove empty paths (tolerate trailing comma in args)
            paths.forEach(path => {
              const pathParts = path.match(/([^\s]+)/g);
              const pathFrom = pathParts[0];
              const pathTo = pathParts[pathParts.length - 1];
              _.set(copy, pathTo, _.get(obj, pathFrom));
            });
            return copy;
          }),
      },
      allowRegexp: true,
    });

    return result;
  }

  static _queriesFromString(queryString) {
    // Remove white space
    queryString = queryString.replace(/(\s\s|\t|\r|\n)/gm, '');

    // Match and store (...args) from query so we can split by comma
    const methodArgs = queryString.match(/\(([^)]+)\)/g);

    // Replace (...args) with empty ()
    queryString = queryString.replace(/\(.*?\)/g, '()');

    // Extract queries
    let queries = queryString.split(/,(?![^([]*[\])])/g);

    queries = queries.map(query => {
      // Replace () with original (...args)
      const emptyArgs = query.match(/\(\)/g);
      if (emptyArgs) {
        _.times(emptyArgs.length, () => {
          query = query.replace('()', methodArgs.splice(0, 1));
        });
      }
      return query.trim();
    });

    return queries;
  }

  async _entitiesById(ids = [], options = {}) {
    options = _.merge(
      {
        parents: false,
        role: 'guest',
      },
      options
    );

    const query = {
      include_docs: true,
    };

    if (ids.length) {
      query.keys = ids;
    }

    const result = await Db.connect(this.config).view(
      'entity',
      options.parents ? 'byIdExtended' : 'byId',
      query
    );

    result.rows = result.rows.map(row => {
      row.doc = Entity._filterEntityFields(row.doc, options.role);
      return row;
    });

    result.rows = Entity._appendParents(
      result.rows,
      options.parents,
      options.role
    );

    return result;
  }

  static _childDepthLimit(children) {
    let limit = 0;
    if (_.isNumber(children)) {
      limit = children - 1;
    }
    if (_.isArray(children)) {
      limit = children.length - 1;
    }
    return limit;
  }

  async _getDocMap(rowsOrDocs, docMap = {}, options = {}) {
    options._childDepth = options._childDepth || 0;

    if (!options.parents && !options.children) {
      return docMap;
    }

    let ids = [];
    let childIds = [];

    rowsOrDocs.forEach(rowOrDoc => {
      const isRow = !!rowOrDoc.doc;

      let doc = isRow ? rowOrDoc.doc : rowOrDoc;

      doc = Entity._filterEntityFields(doc, options.role);

      if (options.children && doc.fields && _.size(doc.fields)) {
        if (_.isArray(options.children)) {
          Entity._queriesFromString(
            options.children[options._childDepth]
          ).forEach(query => {
            childIds = childIds.concat(
              _.flatten(Entity._query(doc, query, true).value).map(
                obj => obj && obj.id
              )
            );
          });
        } else {
          _.forEach(doc.fields, field => {
            if (_.isArray(field.value)) {
              field.value = field.value.filter(obj => obj);

              field.value.forEach(obj => {
                if (obj.id) {
                  childIds.push(obj.id);
                }
              });
            }
          });
        }
      }

      ids.push(isRow ? rowOrDoc.id : doc._id || doc.id);
    });

    ids = _.uniq(ids);
    ids = ids.filter(id => !docMap[id]);

    let docs = [];
    if (ids.length > 0) {
      docs = (await this._entitiesById(ids, options)).rows.map(row => row.doc);

      docs.forEach(doc => {
        docMap[doc._id] = doc;
      });
    }

    childIds = _.uniq(childIds);
    childIds = childIds.filter(id => !docMap[id]);

    let childDocs = [];
    if (childIds.length > 0) {
      childDocs = (
        await this._entitiesById(childIds, { ...options, parents: false })
      ).rows.map(row => row.doc);

      childDocs.forEach(doc => {
        docMap[doc._id] = doc;
      });
    }

    if (
      !options.children ||
      options._childDepth === Entity._childDepthLimit(options.children)
    ) {
      return docMap;
    }

    return await this._getDocMap(childDocs, docMap, {
      ...options,
      parents: false,
      _childDepth: options._childDepth + 1,
    });
  }

  static _mergeDocs(
    docs,
    docMap,
    options = { children: false, parents: false }
  ) {
    options._childDepth = options._childDepth || 0;

    if (
      options.children &&
      options._childDepth - 1 === Entity._childDepthLimit(options.children)
    ) {
      return docs;
    }

    docs = docs.map(rowOrDoc => {
      const isRow = !!rowOrDoc.doc;

      let doc = isRow ? rowOrDoc.doc : rowOrDoc;

      if (docMap[rowOrDoc.id || rowOrDoc._id]) {
        doc = _.merge({}, doc, docMap[rowOrDoc.id || rowOrDoc._id]);
      }

      if (options.children && doc.fields && _.size(doc.fields)) {
        let fieldQueryMap;

        if (_.isArray(options.children)) {
          fieldQueryMap = {};
          Entity._queriesFromString(
            options.children[options._childDepth]
          ).forEach(query => {
            const key = query.split(/\[|\]/)[0];
            fieldQueryMap[key] = query;
          });
        }

        doc.fields = _.mapValues(doc.fields, (field, fieldSlug) => {
          if (_.isArray(field.value)) {
            field.value = field.value.filter(obj => obj);

            if (!fieldQueryMap || (fieldQueryMap && fieldQueryMap[fieldSlug])) {
              if (fieldQueryMap && fieldQueryMap[fieldSlug]) {
                field.value = field.value.filter(
                  obj => obj.id && docMap[obj.id]
                );
              }

              field.value = field.value.map(obj => {
                if (obj && obj.id && docMap[obj.id]) {
                  obj = _.merge(obj, docMap[obj.id] || {});
                  obj = _.omitBy(obj, (value, key) => key.startsWith('_'));
                }
                return obj;
              });

              field.value = Entity._mergeDocs(field.value, docMap, {
                ...options,
                _childDepth: options._childDepth + 1,
              });
            }
          }
          return field;
        });

        doc.fields = _.mapValues(doc.fields, (field, fieldSlug) => {
          if (_.isArray(field.value)) {
            if (fieldQueryMap && fieldQueryMap[fieldSlug]) {
              field.value = _.flatten(
                Entity._query(doc, fieldQueryMap[fieldSlug], true).value
              );
            }
          }
          return field;
        });
      }

      if (_.isArray(options.parents) && doc.parents) {
        doc.parents = _.flatten(
          Entity._query(doc.parents, options.parents[0]).value
        );
      }

      if (isRow) {
        rowOrDoc.doc = doc;
      } else {
        rowOrDoc = doc;
      }

      return rowOrDoc;
    });

    return docs;
  }

  async _extendRowsOrDocs(rowsOrDocs, options = {}) {
    options = _.merge(
      {
        select: false,
        children: false,
        parents: false,
        role: 'guest',
      },
      options
    );

    let docMap = await this._getDocMap(rowsOrDocs, {}, options);

    rowsOrDocs = Entity._mergeDocs(rowsOrDocs, docMap, options);

    if (options.select) {
      rowsOrDocs = _.flatten(Entity._query(rowsOrDocs, options.select).value);
    }

    docMap = null;

    return rowsOrDocs;
  }

  _removeChildren(entities) {
    return new Promise((resolve, reject) => {
      if (entities.length === 0) {
        resolve([]);
        return;
      }

      entities = entities.map(entity => entity._id);

      Db.connect(this.config)
        .view('entity', 'byChildren', {
          keys: entities,
          include_docs: true,
        })
        .then(response => {
          const updatedEntities = _.uniqBy(
            response.rows,
            row => row.doc._id
          ).map(row => {
            row.doc.fields = _.mapValues(row.doc.fields, field => {
              if (_.isArray(field.value)) {
                field.value = _.filter(
                  field.value,
                  obj =>
                    !(obj.type === 'entity' && entities.indexOf(obj.id) !== -1)
                );
              }
              return field;
            });

            return row.doc;
          });

          if (updatedEntities.length === 0) {
            resolve([]);
            return;
          }

          Helpers.chunkUpdate(
            this.config,
            updatedEntities,
            CHUNK_UPDATE_SIZE
          ).then(resolve, reject);
        }, reject);
    });
  }

  _updateChildren(entities) {
    return new Promise((resolve, reject) => {
      if (entities.length === 0) {
        resolve([]);
        return;
      }

      const entityMap = {};

      entities = entities.map(entity => {
        entityMap[entity._id] = entity;

        return entity._id;
      });

      Db.connect(this.config)
        .view('entity', 'byChildren', {
          keys: entities,
          include_docs: true,
        })
        .then(response => {
          const entities = response.rows.map(row => {
            const entity = row.doc;

            _.forEach(entity.fields, (field, fieldSlug) => {
              if (_.isArray(field.value)) {
                entity.fields[fieldSlug].value = field.value
                  .filter(obj => obj)
                  .map(obj => {
                    if (obj.type === 'entity' && entityMap[obj.id]) {
                      obj.slug = entityMap[obj.id].slug;
                      obj.title = entityMap[obj.id].title;
                      obj.schema = entityMap[obj.id].schema;
                      obj.published = entityMap[obj.id].published;

                      if (entityMap[obj.id].thumbnail) {
                        obj.thumbnail = entityMap[obj.id].thumbnail;
                      } else {
                        obj.thumbnail = null;
                      }
                    }

                    return obj;
                  });
              }
            });

            return entity;
          });

          Helpers.chunkUpdate(this.config, entities, CHUNK_UPDATE_SIZE).then(
            resolve,
            reject
          );
        }, reject);
    });
  }

  async entityList(ids = [], options = {}) {
    options = _.merge(
      {
        select: false,
        children: false,
        parents: false,
        role: 'guest',
      },
      options
    );

    const result = await this._entitiesById(ids, options);

    const rows = await this._extendRowsOrDocs(result.rows, options);

    return rows;
  }

  _entitySearch(query, options = {}) {
    return new Promise((resolve, reject) => {
      query.limit = Math.min(query.limit || 200, 200);

      if (options.children) {
        query.include_docs = true;
      }

      if (!query.include_fields) {
        query.include_fields = [];
      }

      if (!query.sort) {
        delete query.sort;
      }
      if (!query.bookmark) {
        delete query.bookmark;
      }
      if (!query.index) {
        delete query.index;
      }
      if (!query.group_field) {
        delete query.group_field;
      }

      Db.connect(this.config)
        .search('entity', query.index || 'all', query)
        .then(result => {
          if (result.groups) {
            const promises = [];

            result.groups = result.groups.map(group => {
              promises.push(
                new Promise((resolve, reject) => {
                  if (
                    (!options.children && !options.parents) ||
                    group.total_rows === 0
                  ) {
                    resolve();
                    return;
                  }

                  this._extendRowsOrDocs(group.hits, options).then(docs => {
                    group.hits = docs;

                    resolve();
                  }, reject);
                })
              );
              return group;
            });

            Promise.all(promises).then(() => {
              resolve(result);
            }, reject);

            return;
          }

          this._extendRowsOrDocs(result.rows, options).then(docs => {
            result.rows = docs;

            resolve(result);
          }, reject);
        }, reject);
    });
  }

  entitySearch(query, options = {}) {
    options = _.merge(
      {
        children: false,
        parents: false,
        role: 'guest',
      },
      options
    );

    return new Promise((resolve, reject) => {
      const limit = query.limit || 25;

      if (limit <= 200) {
        this._entitySearch(query, options).then(resolve, reject);
        return;
      }

      let rows = [];
      let groups = [];

      function __entitySearch(bookmark) {
        const _query = _.clone(query);

        if (bookmark) {
          _query.bookmark = bookmark;
        }

        this._entitySearch(_query, options).then(result => {
          if (result.rows) {
            rows = rows.concat(result.rows);
          }
          if (result.groups) {
            groups = groups.concat(result.groups);
          }

          if (rows.length < result.total_rows && rows.length < limit) {
            __entitySearch.call(this, result.bookmark);
            return;
          }

          result.rows = rows;
          result.groups = groups;

          resolve(result);
        }, reject);
      }

      __entitySearch.call(this);
    });
  }

  async entityFind(query, options = {}) {
    options = _.merge(
      {
        children: false,
        parents: false,
        role: 'guest',
      },
      options
    );

    let result;

    try {
      result = await Db.connect(this.config).find(query);
    } catch (error) {
      if (error.error === 'no_usable_index') {
        const cc = new ClientConfig(this.config);
        const clientConfig = await cc.get();

        const schema = new Schema(this.config);
        await schema.updateEntityIndex(clientConfig.schemas);

        result = await Db.connect(this.config).find(query);
      }
    }

    if (options.children === false) {
      return result;
    }

    if (query.fields && query.fields.indexOf('_id') === -1) {
      throw new Error('_id field required for `children`');
    }

    result.docs = await this._extendRowsOrDocs(result.docs, options);

    return result;
  }

  entityRevisions(entityId) {
    return new Promise((resolve, reject) => {
      Db.connect(this.config)
        .get(entityId, {
          revs_info: true,
        })
        .then(response => {
          const revisionIds = [];

          response._revs_info.forEach(revision => {
            if (revision.status === 'available') {
              revisionIds.push(revision.rev);
            }
          });

          Db.connect(this.config)
            .get(entityId, {
              open_revs: JSON.stringify(revisionIds),
            })
            .then(response => {
              const revisions = [];
              const childrenIds = [];

              response.forEach(revision => {
                if (revision.ok) {
                  revisions.push(revision.ok);

                  _.forEach(revision.ok.fields, field => {
                    if (/entity/.test(field.type)) {
                      _.forEach(field.value, obj => {
                        if (obj.id) {
                          childrenIds.push(obj.id);
                        }
                      });
                    }
                  });
                }
              });

              Db.connect(this.config)
                .fetch({
                  keys: _.uniq(childrenIds),
                  include_docs: true,
                })
                .then(result => {
                  const childrenMap = {};

                  result.rows.forEach(row => {
                    try {
                      childrenMap[row.doc._id] = row.doc;
                    } catch (error) {
                      console.error('Error: child no longer exists');
                    }
                  });

                  resolve(Entity._appendChildren(revisions, childrenMap));
                }, reject);
            }, reject);
        }, reject);
    });
  }

  entityCreate(entity) {
    return new Promise((resolve, reject) => {
      entity.type = 'entity';

      Db.connect(this.config)
        .insert(entity)
        .then(response => {
          entity._id = response.id;
          entity._rev = response.rev;

          resolve(entity);
        }, reject);
    });
  }

  entityRead(entityId) {
    return new Promise((resolve, reject) => {
      Db.connect(this.config)
        .get(entityId)
        .then(resolve, reject);
    });
  }

  async entityUpdate(entities, restore) {
    entities = _.isArray(entities) ? entities : [entities];

    const entityMap = {};

    const entityIds = entities.map(entityOrEntityId => {
      let entityId;

      if (_.isObject(entityOrEntityId)) {
        entityId = entityOrEntityId._id;
        entityMap[entityId] = entityOrEntityId;
      }
      if (_.isString(entityOrEntityId)) {
        entityId = entityOrEntityId;
      }

      return entityId;
    });

    const response = await Db.connect(this.config).fetch({
      keys: entityIds,
      include_docs: true,
    });

    const children = [];
    const oldFileNames = [];

    entities = response.rows.map(row => {
      const oldEntity = row.doc;
      const newEntity = entityMap[oldEntity._id];

      let entity = oldEntity;

      if (newEntity) {
        delete newEntity._rev;

        const diffs = diff(oldEntity, newEntity);

        diffs.forEach(diff => {
          // If any reference fields have changed, update all references
          if (/published|slug|title|thumbnail/.test(diff.path[0])) {
            if (
              children.indexOf(newEntity) === -1 &&
              entityIds.indexOf(newEntity._id) !== -1
            ) {
              children.push(newEntity);
            }
          }

          // If any file fields have changed, remove the old file
          if (diff.path[0] === 'fields' && diff.path[2] === 'value') {
            const field = oldEntity.fields[diff.path[1]];
            if (
              /attachment|image|audio|video/.test(field.type) &&
              field.value
            ) {
              oldFileNames.push(field.value.file.name);
            }
          }
        });

        entity = _.mergeWith({}, oldEntity, newEntity, (a, b) => {
          if (_.isArray(a) && _.isArray(b)) {
            return b;
          }
          return undefined;
        });
      }

      if (restore) {
        entity.trashed = false;
      }

      return entity;
    });

    if (oldFileNames.length) {
      // TODO: fix delete orphaned files
      // const assist = new Assist(this.config);
      // await assist.deleteFiles(oldFileNames);
    }

    if (children.length) {
      await this._updateChildren(children);
    }

    const result = await Helpers.chunkUpdate(
      this.config,
      entities,
      CHUNK_UPDATE_SIZE
    );

    return result;
  }

  async entityDelete(entityIds, forever = false) {
    let entities;
    let filesResult;

    if (entityIds === 'trashed') {
      forever = true;

      entities = (
        await Db.connect(this.config).view('entity', 'trashed', {
          include_docs: true,
        })
      ).rows;
    } else {
      entities = (
        await Db.connect(this.config).fetch({
          keys: _.isArray(entityIds) ? entityIds : [entityIds],
          include_docs: true,
        })
      ).rows;
    }

    entities = entities.filter(
      entity => !entity.value || !entity.value.deleted
    );

    entities = entities.map(entity => entity.doc);

    await this._removeChildren(entities);

    if (forever) {
      const fileNames = Entity._fileNames(entities);

      if (fileNames.length) {
        const assist = new Assist(this.config);
        filesResult = await assist.deleteFiles(fileNames);
      }

      entities = entities.map(entity => ({
        _id: entity._id,
        _rev: entity._rev,
        _deleted: true,
      }));
    } else {
      entities = entities.map(entity => {
        entity.trashed = true;
        return entity;
      });
    }

    const entitiesResult = await Helpers.chunkUpdate(
      this.config,
      entities,
      CHUNK_UPDATE_SIZE
    );

    return {
      entities: entitiesResult,
      files: filesResult,
    };
  }
}

module.exports = Entity;
