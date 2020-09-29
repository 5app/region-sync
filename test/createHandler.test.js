const tap = require('tap');
const nock = require('nock');
const crypto = require('crypto');

const {createHandler} = require('../');

nock.disableNetConnect();
nock.enableNetConnect((host) => {
	return host.includes('localhost') || host.includes('127.0.0.1');
});
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

function md5(string) {
	return crypto.createHash('md5').update(string).digest('hex');
}

function nockReceiveMessage(queueUrl, messageObj, times = 1) {
	const receiptHandle = 'fooreceipthandle';
	let messageXml = '';
	if (messageObj !== null) {
		const message =
			typeof messageObj === 'string'
				? messageObj
				: JSON.stringify(messageObj);
		const body = JSON.stringify({
			Type: 'Notification',
			MessageId: '56f45548-d39f-4d04-ab11-5edb91e02c92',
			Token: null,
			TopicArn: 'arn:aws:sns:us-east-1:000000000000:foo',
			Message: message,
			SubscribeURL: null,
			Timestamp: '2020-09-21T12:26:41.460Z',
			SignatureVersion: '1',
			Signature: 'EXAMPLEpH+..',
			SigningCertURL:
				'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0000000000000000000000.pem',
		});
		messageXml = `<Message><MessageId>9d1dd143-4c74-1dac-0942-277a510e258f</MessageId><ReceiptHandle>${receiptHandle}</ReceiptHandle><MD5OfBody>${md5(
			body
		)}</MD5OfBody><Body>${body}</Body><Attribute><Name>SenderId</Name><Value>AIDAIT2UOQQY3AUEKVGXU</Value></Attribute><Attribute><Name>SentTimestamp</Name><Value>1600691201471</Value></Attribute><Attribute><Name>ApproximateReceiveCount</Name><Value>1</Value></Attribute><Attribute><Name>ApproximateFirstReceiveTimestamp</Name><Value>1600691209293</Value></Attribute></Message>`;
	}
	const scope = nock('http://localhost:4576', {encodedQueryParams: true})
		.post(
			'/',
			`Action=ReceiveMessage&MaxNumberOfMessages=1&QueueUrl=${encodeURIComponent(
				queueUrl
			)}&Version=2012-11-05&VisibilityTimeout=30&WaitTimeSeconds=1`
		)
		.times(times)
		.reply(
			200,
			`<ReceiveMessageResponse><ReceiveMessageResult>${messageXml}</ReceiveMessageResult><ResponseMetadata><RequestId>Z23FQ54T017S3LLJYZOQDG34P9WSPZHUWFHV9M4EU6F44PIMSOAL</RequestId></ResponseMetadata></ReceiveMessageResponse>`
		);
	return {
		scope,
		receiptHandle,
	};
}
function nockReceiveError(queueUrl, times = 1) {
	const scope = nock('http://localhost:4576', {encodedQueryParams: true})
		.post(
			'/',
			`Action=ReceiveMessage&MaxNumberOfMessages=1&QueueUrl=${encodeURIComponent(
				queueUrl
			)}&Version=2012-11-05&VisibilityTimeout=30&WaitTimeSeconds=1`
		)
		.times(times)
		.reply(400, 'eg bad queue url');
	return {
		scope,
	};
}

function nockDeleteMessage(queueUrl, receiptHandle, times = 1) {
	const scope = nock('http://localhost:4576', {encodedQueryParams: true})
		.post(
			'/',
			`Action=DeleteMessage&QueueUrl=${encodeURIComponent(
				queueUrl
			)}&ReceiptHandle=${receiptHandle}&Version=2012-11-05`
		)
		.times(times)
		.reply(
			200,
			'<DeleteMessageResponse><ResponseMetadata><RequestId>WICS1CGEMVU5GT85FA3CYTXRK7WWY1L4MYQUP3O11H24QK32GJMD</RequestId></ResponseMetadata></DeleteMessageResponse>'
		);
	return {
		scope,
	};
}

tap.test('should receive messages', (t) => {
	const queueUrl = 'http://localhost:4576/000000000000/fooq';
	const {scope: nockReceiveScope, receiptHandle} = nockReceiveMessage(
		queueUrl,
		{fromRegion: 'eu-west-2', payload: {real: 'data'}},
		2
	);
	const {scope: nockDeleteScope} = nockDeleteMessage(
		queueUrl,
		receiptHandle,
		2
	);
	const handler = createHandler({
		awsEndpoint: 'http://localhost:4566',
		backoffSeconds: 4,
		longPollSeconds: 1,
		currentRegion: 'us-east-1',
	});
	let handlerCalls = 0;
	handler.addQueueHandler(queueUrl, (msg) => {
		t.same(msg, {
			fromRegion: 'eu-west-2',
			payload: {
				real: 'data',
			},
		});
		handlerCalls++;
	});
	setTimeout(() => {
		handler.deregister();
		t.equal(handlerCalls, 2);
		nockReceiveScope.done();
		nockDeleteScope.done();
		t.end();
	}, 2000);
});

tap.test('should not receive messages if disabled', (t) => {
	const queueUrl = 'http://localhost:4576/000000000000/fooq';
	const {scope: nockReceiveScope} = nockReceiveMessage(
		queueUrl,
		{fromRegion: 'eu-west-2', payload: {real: 'data'}},
		2
	);
	const handler = createHandler({
		awsEndpoint: 'http://localhost:4566',
		backoffSeconds: 4,
		longPollSeconds: 1,
		currentRegion: 'us-east-1',
		enabled: false,
	});

	handler.addQueueHandler(queueUrl, () => {
		throw new Error("This shouldn't be called because it's disabled");
	});
	setTimeout(() => {
		t.notOk(nockReceiveScope.isDone());
		nock.cleanAll();
		handler.deregister();
		t.end();
	}, 2000);
});

tap.test('ignores message from own region', (t) => {
	const queueUrl = 'http://localhost:4576/000000000000/fooq';
	const otherRegion = {fromRegion: 'eu-west-2', payload: {real: 'data'}};
	const ownRegion = {fromRegion: 'us-east-1', payload: {real: 'wrong'}};
	const {scope: nockOwnRegionScope} = nockReceiveMessage(
		queueUrl,
		ownRegion,
		1
	);
	const {scope: nockReceiveScope, receiptHandle} = nockReceiveMessage(
		queueUrl,
		otherRegion,
		1
	);
	const {scope: nockDeleteScope} = nockDeleteMessage(
		queueUrl,
		receiptHandle,
		2
	);
	const handler = createHandler({
		awsEndpoint: 'http://localhost:4566',
		backoffSeconds: 4,
		longPollSeconds: 1,
		currentRegion: 'us-east-1',
	});
	let handlerCalls = 0;
	handler.addQueueHandler(queueUrl, (msg) => {
		t.same(msg, {
			fromRegion: 'eu-west-2',
			payload: {
				real: 'data',
			},
		});
		handlerCalls++;
	});
	setTimeout(() => {
		handler.deregister();
		t.equal(handlerCalls, 1);
		nockReceiveScope.done();
		nockOwnRegionScope.done();
		nockDeleteScope.done();
		t.end();
	}, 2000);
});

tap.test(
	'invalid messages should not delete (dead letter queue will remove them on server)',
	(t) => {
		const queueUrl = 'http://localhost:4576/000000000000/fooq';
		const invalidMessage = 'not valid';
		const validMessage = {fromRegion: 'eu-west-2', payload: {real: 'data'}};
		const {scope: nockReceiveErrorScope} = nockReceiveMessage(
			queueUrl,
			invalidMessage,
			1
		);
		const {scope: nockReceiveScope, receiptHandle} = nockReceiveMessage(
			queueUrl,
			validMessage,
			1
		);
		const {scope: nockDeleteScope} = nockDeleteMessage(
			queueUrl,
			receiptHandle,
			1
		);
		const handler = createHandler({
			awsEndpoint: 'http://localhost:4566',
			backoffSeconds: 4,
			longPollSeconds: 1,
			currentRegion: 'us-east-1',
		});
		let handlerCalls = 0;
		handler.addQueueHandler(queueUrl, (msg) => {
			t.same(msg, {
				fromRegion: 'eu-west-2',
				payload: {
					real: 'data',
				},
			});
			handlerCalls++;
		});
		setTimeout(() => {
			handler.deregister();
			t.equal(handlerCalls, 1);
			nockReceiveErrorScope.done();
			nockReceiveScope.done();
			nockDeleteScope.done();
			t.end();
		}, 1100);
	}
);

tap.test('should backoff and resume for errors', (t) => {
	const queueUrl = 'http://localhost:4576/000000000000/fooq';
	const {scope: nockReceiveErrorScope} = nockReceiveError(queueUrl);
	const {scope: nockReceiveScope, receiptHandle} = nockReceiveMessage(
		queueUrl,
		{
			fromRegion: 'eu-west-2',
			payload: {real: 'data'},
		}
	);
	const {scope: nockDeleteScope} = nockDeleteMessage(queueUrl, receiptHandle);
	const handler = createHandler({
		awsEndpoint: 'http://localhost:4566',
		backoffSeconds: 1,
		longPollSeconds: 1,
		currentRegion: 'us-east-1',
	});
	let handlerCalls = 0;
	handler.addQueueHandler(queueUrl, (msg) => {
		t.same(msg, {
			fromRegion: 'eu-west-2',
			payload: {
				real: 'data',
			},
		});
		handlerCalls++;
	});

	setTimeout(() => {
		t.equal(handlerCalls, 0);
		t.notOk(nockReceiveScope.isDone());
		t.notOk(nockDeleteScope.isDone());
		nockReceiveErrorScope.done();
	}, 1000);

	setTimeout(() => {
		handler.deregister();
		t.equal(handlerCalls, 1);
		nockReceiveScope.done();
		nockDeleteScope.done();
		t.end();
	}, 2000);
});

tap.test('should accept no messages and keep listening', (t) => {
	const queueUrl = 'http://localhost:4576/000000000000/fooq';
	const {scope: nockNoMessagesScope} = nockReceiveMessage(queueUrl, null);
	const {scope: nockReceiveScope, receiptHandle} = nockReceiveMessage(
		queueUrl,
		{
			fromRegion: 'eu-west-2',
			payload: {real: 'data'},
		}
	);
	const {scope: nockDeleteScope} = nockDeleteMessage(queueUrl, receiptHandle);
	const handler = createHandler({
		awsEndpoint: 'http://localhost:4566',
		backoffSeconds: 1,
		longPollSeconds: 1,
		currentRegion: 'us-east-1',
	});
	let handlerCalls = 0;
	handler.addQueueHandler(queueUrl, (msg) => {
		t.same(msg, {
			fromRegion: 'eu-west-2',
			payload: {
				real: 'data',
			},
		});
		handlerCalls++;
	});

	setTimeout(() => {
		t.equal(handlerCalls, 0);
		t.notOk(nockReceiveScope.isDone());
		t.notOk(nockDeleteScope.isDone());
		nockNoMessagesScope.done();
	}, 1000);

	setTimeout(() => {
		handler.deregister();
		t.equal(handlerCalls, 1);
		nockReceiveScope.done();
		nockDeleteScope.done();
		t.end();
	}, 2000);
});
