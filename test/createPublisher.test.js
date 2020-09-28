const tap = require('tap');
const nock = require('nock');

const {createPublisher} = require('../');

nock.enableNetConnect((host) => {
	return host.includes('localhost') || host.includes('127.0.0.1');
});
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const topicArn = 'arn:aws:sns:us-east-1:000000000000:foo';
const payload = {some: 'payload'};
const currentRegion = 'us-east-1';

function nockPublish(topicArn, expectedPayload, expectedRegion) {
	return nock('http://localhost:4566', {encodedQueryParams: true})
		.post('/', (body) => {
			// because have a date in the message we can't just declare what we expect but use a function to
			// work it out.
			const {Action, TopicArn, Message} = body;
			const {payload, fromRegion} = JSON.parse(Message);
			return (
				Action === 'Publish' &&
				TopicArn === topicArn &&
				JSON.stringify(payload) === JSON.stringify(expectedPayload) &&
				fromRegion === expectedRegion
			);
		})
		.reply(
			200,
			'<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">\n        <PublishResult>\n            <MessageId>a41e707c</MessageId>\n        </PublishResult>\n        <ResponseMetadata><RequestId>43398369</RequestId></ResponseMetadata>\n        </PublishResponse>'
		);
}

tap.test('should publish message', async (t) => {
	const scope = nockPublish(topicArn, payload, currentRegion);
	const publisher = createPublisher({
		currentRegion,
		awsEndpoint: 'http://localhost:4566',
		snsRegion: 'us-east-1',
	});
	const res = await publisher.publish(topicArn, payload);
	t.same(Object.keys(res), ['ResponseMetadata', 'MessageId']);
	scope.done();
});

tap.test('should publish default null payload', async (t) => {
	const scope = nockPublish(topicArn, null, currentRegion);
	const publisher = createPublisher({
		currentRegion,
		awsEndpoint: 'http://localhost:4566',
		snsRegion: 'us-east-1',
	});
	const res = await publisher.publish(topicArn);
	t.same(Object.keys(res), ['ResponseMetadata', 'MessageId']);
	scope.done();
});

tap.test('should not publish if disabled', async (t) => {
	const publisher = createPublisher({
		currentRegion,
		awsEndpoint: 'http://localhost:4566',
		snsRegion: 'us-east-1',
		enabled: false,
	});
	const res = await publisher.publish(topicArn, payload);
	t.notOk(res);
});
