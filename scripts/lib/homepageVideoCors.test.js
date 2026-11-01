'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RULE_ID, homepageVideoCorsRule, mergeHomepageVideoCorsRule } = require('./homepageVideoCors');

test('homepage video CORS permits the site origin to PUT signed media with Content-Type', () => {
  assert.deepEqual(homepageVideoCorsRule('https://vidyasetu.sbs'), {
    ID: RULE_ID,
    AllowedHeaders: ['content-type'],
    AllowedMethods: ['GET', 'HEAD', 'PUT'],
    AllowedOrigins: ['https://vidyasetu.sbs'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  });
});

test('merging replaces only the VidyaSetu rule and preserves other bucket CORS rules', () => {
  const previousRule = { ID: 'other-service', AllowedOrigins: ['https://other.example'], AllowedMethods: ['POST'] };
  const oldVidyaSetuRule = { ID: RULE_ID, AllowedOrigins: ['https://old.example'], AllowedMethods: ['PUT'] };
  const merged = mergeHomepageVideoCorsRule([previousRule, oldVidyaSetuRule], 'https://vidyasetu.sbs');
  assert.equal(merged.length, 2);
  assert.equal(merged[0], previousRule);
  assert.equal(merged[1].AllowedOrigins[0], 'https://vidyasetu.sbs');
});

test('homepage video CORS rule rejects non-HTTPS and non-origin values', () => {
  assert.throws(() => homepageVideoCorsRule('http://vidyasetu.sbs'));
  assert.throws(() => homepageVideoCorsRule('https://vidyasetu.sbs/admin'));
});
