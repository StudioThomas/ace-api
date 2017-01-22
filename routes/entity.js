const _ = require('lodash');
const Auth = require('../lib/auth');
const Entity = require('../lib/entity');

module.exports = (config) => {

  /**
   * @swagger
   * /entities/search:
   *  get:
   *    tags:
   *      - entities
   *    summary: Search entities
   * #   description: Search entities
   *    produces:
   *      - application/json
   *    parameters:
   *      - name: q
   *        description: Lucene search query
   *        in: query
   *        required: true
   *        type: string
   *      - name: index
   *        description: Search index
   *        in: query
   *        required: false
   *        type: string
   *        default: all
   *      - name: children
   *        description: Get child entities
   *        in: query
   *        required: false
   *        type: boolean
   *        default: false
   *      - name: parents
   *        description: Get parent entities
   *        in: query
   *        required: false
   *        type: boolean
   *        default: false
   *    responses:
   *      200:
   *        description: Search result
   */
  config._router.get('/entities/search?.:ext?', config._useCachedResponse, (req, res) => {
    let children = req.query.children !== undefined ? JSON.parse(req.query.children) : false;
    let parents = req.query.parents !== undefined ? JSON.parse(req.query.parents) : false;
    const trashed = req.query.trashed !== undefined ? JSON.parse(req.query.trashed) : false;
    const query = [];

    req.query.include_docs = req.query.include_docs ? JSON.parse(req.query.include_docs) : false;

    if (children === true) {
      children = 1;
    }
    if (parents === true) {
      parents = 1;
    }

    if (children) {
      req.query.include_docs = false;
    }
    if (parents) {
      req.query.include_docs = true;
    }

    query.push(trashed ? 'trashed:true' : '!trashed:true');

    if (!req.session.userAuthorised && !req.session.guestAuthorised) {
      query.push('published:true');
    }

    if (req.query.q) {
      query.push(req.query.q);
    }

    req.query.q = query.join(' AND ');

    const entity = new Entity(config._db.bind(null, req));

    entity.entitySearch(req.query.index || 'all', req.query, children, parents, req.session.userAuthorised || req.session.guestAuthorised)
      .then(config._cacheAndSendResponse.bind(null, req, res), config._handleError.bind(null, res));
  });

  config._router.get('/entities/find.:ext?', config._useCachedResponse, (req, res) => {
    const query = JSON.parse(req.query.query);
    let children = req.query.children !== undefined ? JSON.parse(req.query.children) : false;
    let parents = req.query.parents !== undefined ? JSON.parse(req.query.parents) : false;

    if (children === true) {
      children = 1;
    }
    if (parents === true) {
      parents = 1;
    }

    if (req.session.userAuthorised || req.session.guestAuthorised) {
      query.use_index = ['entityIndex', 'active'];
    } else {
      query.use_index = ['entityIndex', 'published'];
    }

    const entity = new Entity(config._db.bind(null, req));

    entity.entityFind(query, children, parents, req.session.userAuthorised || req.session.guestAuthorised)
      .then(config._cacheAndSendResponse.bind(null, req, res), config._handleError.bind(null, res));
  });

  config._router.get('/entities/filterValues.:ext?', config._ensureAuthenticated, (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityFilterValues(req.query)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.all('/entities/:view?/:list?.:ext?', config._useCachedResponse, (req, res) => {
    let children = req.query.children !== undefined ? JSON.parse(req.query.children) : false;
    let parents = req.query.parents !== undefined ? JSON.parse(req.query.parents) : false;

    if (children === true) {
      children = 1;
    }
    if (parents === true) {
      parents = 1;
    }

    const keys = req.query.ids || req.query.id || req.body.ids || req.body.id;

    req.query.keys = _.isArray(keys) ? keys : [keys];
    req.query.include_docs = true;

    if (req.session.userAuthorised || req.session.guestAuthorised) {
      req.query.state = 'active';
    } else {
      req.query.state = 'published';
    }

    const entity = new Entity(config._db.bind(null, req));

    entity.entityList(req.query, req.params.view, req.params.list, children, parents, req.session.userAuthorised || req.session.guestAuthorised)
      .then(config._cacheAndSendResponse.bind(null, req, res), config._handleError.bind(null, res));
  });

  config._router.get('/entity/revisions.:ext?', config._ensureAuthenticated, (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityRevisions(req.query.id)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.post('/entity.:ext?', config._ensureAuthenticated, Auth.requirePermission.bind(null, 'entityCreate'), (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityCreate(req.body.entity)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.get('/entity.:ext?', config._ensureAuthenticated, Auth.requirePermission.bind(null, 'entityRead'), (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityRead(req.query.id)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.put('/entity.:ext?', config._ensureAuthenticated, Auth.requirePermission.bind(null, 'entityUpdate'), (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityUpdate(req.body.entity || req.body.entities, req.body.restore || false)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.delete('/entity.:ext?', config._ensureAuthenticated, Auth.requirePermission.bind(null, 'entityDelete'), (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityDelete(req.body.entity || req.body.entities, req.body.forever || false)
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

  config._router.delete('/entity/trashed.:ext?', config._ensureAuthenticated, Auth.requirePermission.bind(null, 'entityDelete'), (req, res) => {
    const entity = new Entity(config._db.bind(null, req));

    entity.entityDelete('trashed')
      .then(config._sendResponse.bind(null, res), config._handleError.bind(null, res));
  });

};
