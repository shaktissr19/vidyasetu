'use strict';

const RULE_ID = 'vidyasetu-homepage-video-browser-upload';

function homepageVideoCorsRule(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
    throw new Error('FRONTEND_URL must be an HTTPS origin with no path or trailing slash.');
  }
  return {
    ID: RULE_ID,
    AllowedHeaders: ['content-type'],
    AllowedMethods: ['GET', 'HEAD', 'PUT'],
    AllowedOrigins: [parsed.origin],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  };
}

function mergeHomepageVideoCorsRule(existingRules, origin) {
  const rules = Array.isArray(existingRules) ? existingRules : [];
  return [...rules.filter((rule) => rule.ID !== RULE_ID), homepageVideoCorsRule(origin)];
}

module.exports = { RULE_ID, homepageVideoCorsRule, mergeHomepageVideoCorsRule };
