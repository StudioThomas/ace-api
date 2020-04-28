const _ = require('lodash');
const Db = require('./db');

class Helpers {
  constructor(config) {
    this.config = config;
    this.assistUrl = config.assist.url;
    this.slug = config.slug;
  }

  static async createOrUpdate(config, doc) {
    const db = Db.connect(config);
    let response;

    try {
      response = await db.insert(doc);

      doc._id = response.id;
      doc._rev = response.rev;

      return doc;
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }

    response = await db.get(doc._id);

    doc._rev = response._rev;

    response = await db.insert(doc);

    doc._rev = response.rev;

    return doc;
  }

  static async chunkUpdate(config, docs, chunkSize = 1000) {
    const db = Db.connect(config);

    const chunks = _.chunk(docs, chunkSize);

    const promises = chunks.map((chunk) =>
      db.bulk({
        docs: chunk,
      })
    );

    return await Promise.all(promises);
  }

  static groupEntities(entities, groupSize = Infinity) {
    const grouped = [];

    let group = {
      entities: [],
    };

    entities.forEach((entity) => {
      if (!entity.groupBefore || group.entities.length >= groupSize) {
        group = {
          entities: [],
        };
      }

      group.entities.push(entity);

      if (!entity.groupAfter || group.entities.length >= groupSize) {
        group.ratio = 0;

        group.entities.forEach((entity) => {
          group.ratio += (entity.thumbnail || entity).ratio;
        });

        group.entities.forEach((entity) => {
          entity.groupRatio = (entity.thumbnail || entity).ratio / group.ratio;
        });

        grouped.push(group);
      }
    });

    return grouped;
  }

  static now() {
    return JSON.stringify(new Date()).replace(/"/g, '');
  }

  static replace(array, replacementObject, key) {
    return array.map((object) => {
      if (object[key] === replacementObject[key]) {
        return replacementObject;
      }
      return object;
    });
  }

  thumbnailSrc(thumbnail, settings, cropSlug, cropDefault) {
    if (!thumbnail) {
      return '';
    }

    let settingsArray;

    if (typeof settings === 'string') {
      settingsArray = settings.split(/,|;/);

      settings = {};

      settingsArray.forEach((setting) => {
        setting = setting.split(/_|:/);

        settings[setting[0]] = setting[1];
      });
    }

    const crop = thumbnail.crops ? thumbnail.crops[cropSlug] : false;

    if (crop) {
      settings.x = crop[0];
      settings.y = crop[1];
      settings.x2 = crop[2];
      settings.y2 = crop[3];
    } else if (cropDefault) {
      settings.g = cropDefault;
    }

    settingsArray = [];

    _.forEach(settings, (value, key) => {
      settingsArray.push([key, value].join(':'));
    });

    const settingsString = settingsArray.join(';');

    if (/(image)/.test(thumbnail.thumbnailType)) {
      if (thumbnail.ext === 'svg') {
        return [this.assistUrl, this.slug, thumbnail.name + thumbnail.ext].join(
          '/'
        );
      }

      return [
        this.assistUrl,
        this.slug,
        'transform',
        settingsString,
        thumbnail.name + thumbnail.ext,
      ].join('/');
    }

    if (/(video)/.test(thumbnail.thumbnailType)) {
      return [
        this.assistUrl,
        this.slug,
        'transform',
        settingsString,
        thumbnail.name,
        'thumb.jpg',
      ].join('/');
    }

    if (/(oembed|proxy)/.test(thumbnail.thumbnailType)) {
      const thumbnailUrl = thumbnail.thumbnailUrl.replace(/https?:\/\//, '');

      return [
        this.assistUrl,
        this.slug,
        'proxy',
        'transform',
        settingsString,
        thumbnailUrl,
      ].join('/');
    }

    return '';
  }
}

module.exports = Helpers;
