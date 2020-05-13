const _ = require('lodash');
const odiff = require('odiff');
const Db = require('./db');
const Utils = require('./utils');

const deepFind = (object, match, result = []) => {
  return _.reduce(
    object,
    (result, value, key) => {
      const item = match(value, key, object);

      if (item) {
        if (_.isArray(result)) {
          result.push(item);
        } else {
          result = {
            ...result,
            ...item,
          };
        }
      }

      if (_.isPlainObject(value) || _.isArray(value)) {
        return deepFind(value, match, result);
      }

      return result;
    },
    result
  );
};

const termMatcher = (value) => {
  if (value.id) {
    return {
      [value.id]: {
        id: value.id,
        slug: value.slug,
        title: value.title,
      },
    };
  }
  return false;
};

class Taxonomy {
  constructor(appConfig) {
    this.appConfig = appConfig;

    return this;
  }

  async create(taxonomy) {
    taxonomy = await this.update(taxonomy);
    return taxonomy;
  }

  async read(taxonomySlug) {
    const taxonomy = await Db.connect(this.appConfig).get(
      `taxonomy.${taxonomySlug}`
    );

    if (!taxonomy) {
      throw Error(`Taxonomy not found '${taxonomySlug}'`);
    }

    return { [taxonomySlug]: taxonomy.taxonomy };
  }

  async update(taxonomy) {
    if (!taxonomy.slug) {
      throw Error(`Taxonomy requires 'slug'`);
    }

    try {
      const oldTaxonomy = await this.read(taxonomy.slug);

      const oldTerms = deepFind(oldTaxonomy, termMatcher, {});
      const terms = deepFind(taxonomy, termMatcher, {});

      const changes = odiff(oldTerms, terms);

      const deletedTerms = [];
      changes.forEach((change) => {
        if (change.type === 'unset') {
          deletedTerms.push(this.deleteTerm(change.path[0]));
        }
      });

      await Promise.all(deletedTerms);

      const updatedTerms = [];
      changes.forEach((change) => {
        if (change.type === 'set' && change.path[1] === 'slug') {
          updatedTerms.push(this.updateTerm(terms[change.path[0]]));
        }
      });

      await Promise.all(updatedTerms);
    } catch (error) {
      //
    }

    taxonomy = await Utils.createOrUpdate(this.appConfig, {
      taxonomy,
      _id: `taxonomy.${taxonomy.slug}`,
      type: 'taxonomy',
    });

    return { [taxonomy.slug]: taxonomy.taxonomy };
  }

  async delete(taxonomySlug) {
    let taxonomy = await this.read(taxonomySlug);

    taxonomy._deleted = true;

    taxonomy = await Utils.createOrUpdate(this.appConfig, taxonomy);

    return { [taxonomySlug]: null };
  }

  async entitiesByTerm(termId) {
    if (!termId) {
      throw Error(`'termId' required`);
    }

    const db = Db.connect(this.appConfig);

    const entityGroups = (
      await db.view('entity', 'byTaxonomyTerm', {
        keys: [termId],
        group: true,
      })
    ).rows.map((row) => row.value)[0];

    if (!entityGroups) {
      return [];
    }

    let entityIds = [];

    _.forEach(entityGroups, (entities) => {
      entityIds = entityIds.concat(entities);
    });

    entityIds = _.uniq(entityIds);

    const entities = (
      await db.fetch({ keys: entityIds, include_docs: true })
    ).rows
      .filter((row) => row.doc)
      .map((row) => row.doc);

    return entities;
  }

  async createTerm(taxonomySlug, term) {
    const taxonomy = await this.read(taxonomySlug);

    taxonomy.terms.push(term);

    return this.update(taxonomy);
  }

  async updateTerm({ id, slug, title }) {
    let entities = await this.entitiesByTerm(id);

    entities = entities.map((entity) => {
      entity.fields = _.mapValues(entity.fields, (field) => {
        if (field.type === 'taxonomy' && field.value) {
          if (!field.value.terms) {
            field.value.terms = [];
          }

          field.value.terms = field.value.terms.map((term) => {
            if (term.id === id) {
              term.title = title;
              term.slug = slug;
            }

            if (!term.parents) {
              term.parents = [];
            }

            term.parents = term.parents.map((parent) => {
              if (parent.id === id) {
                parent.title = title;
                parent.slug = slug;
              }
              return parent;
            });

            return term;
          });
        }

        return field;
      });
      return entity;
    });

    const result = await Utils.chunkBulk(this.appConfig, entities);

    return result;
  }

  async deleteTerm(id) {
    let entities = await this.entitiesByTerm(id);

    entities = entities.map((entity) => {
      entity.fields = _.mapValues(entity.fields, (field) => {
        if (field.type === 'taxonomy' && field.value) {
          if (!field.value.terms) {
            field.value.terms = [];
          }

          field.value.terms = field.value.terms.filter((term) => {
            if (term.id === id) {
              return false;
            }

            if (!term.parents) {
              term.parents = [];
            }

            if (_.find(term.parents, (parent) => parent.id === id)) {
              return false;
            }

            return true;
          });
        }

        return field;
      });
      return entity;
    });

    const result = await Utils.chunkBulk(this.appConfig, entities);

    return result;
  }
}

module.exports = Taxonomy;