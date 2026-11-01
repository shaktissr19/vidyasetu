const test = require('node:test');
const assert = require('node:assert/strict');
const { getAwsCredentialMode, getStaticAwsCredentials } = require('../dist/config/awsCredentials');

test('uses the default credential chain when both static AWS keys are empty', () => {
  const env = { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '  ' };
  assert.equal(getAwsCredentialMode(env), 'instance-role');
  assert.equal(getStaticAwsCredentials(env), null);
});

test('uses static credentials only when both key values are present', () => {
  const env = { AWS_ACCESS_KEY_ID: ' access-key ', AWS_SECRET_ACCESS_KEY: ' secret-key ' };
  assert.equal(getAwsCredentialMode(env), 'static');
  assert.deepEqual(getStaticAwsCredentials(env), {
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
  });
});

test('detects a partial static key pair instead of treating it as an instance role', () => {
  assert.equal(getAwsCredentialMode({ AWS_ACCESS_KEY_ID: 'access-key' }), 'partial-static');
  assert.equal(getAwsCredentialMode({ AWS_SECRET_ACCESS_KEY: 'secret-key' }), 'partial-static');
  assert.equal(getStaticAwsCredentials({ AWS_ACCESS_KEY_ID: 'access-key' }), null);
});
