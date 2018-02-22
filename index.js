function Api() { }

Api.defaultConfig = require('./config.default');

Api.Analytics = (...args) => new (require('./lib/analytics'))(...args);
Api.Assist = (...args) => new (require('./lib/assist'))(...args);
Api.Auth = (...args) => new (require('./lib/auth'))(...args);
Api.ClientConfig = (...args) => new (require('./lib/client-config'))(...args);
Api.Db = (...args) => new (require('./lib/db'))(...args);
Api.Ecommerce = (...args) => new (require('./lib/ecommerce'))(...args);
Api.Email = (...args) => new (require('./lib/email'))(...args);
Api.Embedly = (...args) => new (require('./lib/embedly'))(...args);
Api.Entity = (...args) => new (require('./lib/entity'))(...args);
Api.Fields = (...args) => new (require('./lib/fields'))(...args);
Api.File = (...args) => new (require('./lib/file'))(...args);
Api.Flow = (...args) => new (require('./lib/flow'))(...args);
Api.Helpers = (...args) => new (require('./lib/helpers'))(...args);
Api.Instagram = (...args) => new (require('./lib/instagram'))(...args);
Api.Jwt = (...args) => new (require('./lib/jwt'))(...args);
Api.Pdf = (...args) => new (require('./lib/pdf'))(...args);
Api.Roles = (...args) => new (require('./lib/roles'))(...args);
Api.S3 = (...args) => new (require('./lib/s3'))(...args);
Api.Schema = (...args) => new (require('./lib/schema'))(...args);
Api.Settings = (...args) => new (require('./lib/settings'))(...args);
Api.Shippo = (...args) => new (require('./lib/shippo'))(...args);
Api.Stripe = (...args) => new (require('./lib/stripe'))(...args);
Api.Taxonomy = (...args) => new (require('./lib/taxonomy'))(...args);
Api.Tools = (...args) => new (require('./lib/tools'))(...args);
// Api.Transcode = (...args) => new (require('./lib/transcode'))(...args);
Api.User = (...args) => new (require('./lib/user'))(...args);
Api.Zencode = (...args) => new (require('./lib/zencode'))(...args);

module.exports = Api;
