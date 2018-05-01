# ACE API

Content API with included RESTish server.

### Documentation

Documentation is currently a work in progress.

http://petstore.swagger.io/?url=https://rawgit.com/StudioThomas/ace-api/master/docs/api.json#/

### Installation

Push design docs to your couchdb instance using `DB_URL` stored in `.env` file:

```
$ npm run design [DOC_NAME] [DB_NAME[,DB_NAME,DB_NAME]]
```

### Environment Variables

    PORT=5000

    ENVIRONMENT=development|testing|production
    DEBUG=false # Change to nano etc

    DEV_USER_ID=
    DEV_SLUG=
    DEV_ROLE=
    DEV_EMAIL=

    CACHE_ENABLED=false
    CACHE_TTL=30
    CACHE_COMPRESS=false

    DB_NAME=
    DB_URL=

    API_PREFIX=
    API_BLACKLIST_TOKEN=
    API_BLACKLIST_REFERRER=

    SESSION_SECRET=
    SESSION_TTL=

    AUTH_TOKEN_SECRET=

    ASSIST_URL=
    ASSIST_USERNAME=
    ASSIST_PASSWORD=

    EMBEDLY_API_KEY=

    LOGENTRIES_TOKEN=

    AWS_IAM_ACCESS_KEY_ID=
    AWS_IAM_ACCESS_KEY_SECRET=

    AWS_S3_BUCKET=

    REDIS_URL=
    # or
    REDIS_HOST=
    REDIS_PORT=
    REDIS_PASSWORD=

    STRIPE_CLIENT_ID=
    STRIPE_CLIENT_SECRET=
    STRIPE_API_KEY=

    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=

    INSTAGRAM_CLIENT_ID=
    INSTAGRAM_CLIENT_SECRET=

    SPOTIFY_CLIENT_ID=
    SPOTIFY_CLIENT_SECRET=

    VIMEO_CLIENT_ID=
    VIMEO_CLIENT_SECRET=

    ZENCODER_API_KEY=
    ZENCODER_S3_BUCKET=
    ZENCODER_S3_CREDENTIALS=

    TWITTER_ACCESS_TOKEN_KEY=
    TWITTER_ACCESS_TOKEN_SECRET=
    TWITTER_CONSUMER_KEY=
    TWITTER_CONSUMER_SECRET=

### Useful

    # Heroku rebuild (similar to rm -rf node_modules locally)
    $ heroku repo:purge_cache -a appname && \
        git commit --allow-empty -m "rebuild" && \
        git push heroku master
