const logger = require('@5app/logger');
const {SqsConsumer} = require('sns-sqs-big-payload');

const sqsConsumerByQueue = {};

function createHandler(config) {
	const {
		longPollSeconds = 10,
		currentRegion,
		awsEndpoint,
		// backoffSeconds = 30, // Not supported
		enabled = true,
		// we split currentRegion from sqsRegion to solve https://github.com/localstack/localstack/issues/2982
		sqsRegion = currentRegion,
		s3BucketForLargePayloads, // S3 bucket used to store payloads bigger than 256 KB. See https://aws.amazon.com/sns/faqs/#Quotas_and_restrictions
	} = config;

	function deregister() {
		Object.values(sqsConsumerByQueue).forEach((sqsConsumer) => {
			sqsConsumer.stop();
		});
	}

	function consumeMessagesFromQueue(queueUrl, handler) {
		// Features not supported:
		// - setting SQS's VisibilityTimeout is not supported
		// - setting sqsConsumer.connErrorTimeout is not supported (hardcoded to 10 seconds), which corresponds to backoffSeconds
		const sqsConsumer = SqsConsumer.create({
			queueUrl,
			region: sqsRegion,
			getPayloadFromS3: true,
			s3Bucket: s3BucketForLargePayloads,
			batchSize: 1,
			waitTimeSeconds: longPollSeconds,
			sqsEndpointUrl: awsEndpoint,
			s3EndpointUrl: awsEndpoint,
			// if the queue is subscribed to SNS
			// the message will arrive wrapped in sns envelope
			// so we need to unwrap it first
			transformMessageBody: (body) => {
				const snsMessage = JSON.parse(body);
				return snsMessage.Message;
			},
			// if you expect json payload - use `parsePayload` hook to parse it
			parsePayload: (raw) => {
				return JSON.parse(raw);
			},
			// message handler, payload already parsed at this point
			handleMessage: async (message) => {
				const {
					payload: messageData,
					message: {Body, ReceiptHandle, ...messageMetadata},
				} = message;

				const {payload, fromRegion} = messageData;

				if (fromRegion === currentRegion) {
					logger.debug('Ignoring message for own region', {
						fromRegion,
						currentRegion,
					});
				} else {
					logger.debug('Passing message to handler', {
						fromRegion,
						currentRegion,
						payload,
					});
					await handler(messageData, messageMetadata);
				}
			},
		});

		sqsConsumerByQueue[queueUrl] = sqsConsumer;
		sqsConsumer.start();
	}

	return {
		deregister,
		addQueueHandler(queueUrl, handler) {
			if (!enabled) {
				logger.warn(`Attempting to add handler for ${queueUrl} when disabled.`);
			} else {
				consumeMessagesFromQueue(queueUrl, handler);
			}

			return this;
		},
	};
}

module.exports = {
	createHandler,
};
