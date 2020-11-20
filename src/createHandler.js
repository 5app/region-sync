const SQS = require('aws-sdk/clients/sqs');
const logger = require('@5app/logger');

function createHandler(config) {
	const {
		longPollSeconds = 10,
		currentRegion,
		awsEndpoint,
		backoffSeconds = 30,
		enabled = true,
		// we split currentRegion from sqsRegion to solve https://github.com/localstack/localstack/issues/2982
		sqsRegion = currentRegion,
	} = config;

	// closed=true is set during deregister() - will log a warning if you try to send messages once closed
	let closed = false;

	const sqsClient = new SQS({
		region: sqsRegion,
		endpoint: awsEndpoint,
	});

	async function invokeHandler(handler, message, messageMetadata) {
		let messageObj;
		try {
			messageObj = JSON.parse(message);
		} catch (e) {
			throw new Error(
				`Message body is not valid JSON: "${message}", error: ${e}`
			);
		}

		const {fromRegion} = messageObj;
		if (fromRegion === currentRegion) {
			logger.debug('Ignoring message for own region', {
				fromRegion,
				currentRegion,
			});
		} else {
			logger.debug('Passing message to handler', {
				fromRegion,
				currentRegion,
				payload: messageObj.payload,
			});
			await handler(messageObj, messageMetadata);
		}
	}

	async function pollMessages(
		queueUrl,
		handler,
		visibilityTimeoutSeconds = 30
	) {
		if (closed) {
			return;
		}
		logger.debug(`Waiting for messages ${queueUrl} to handler via longpoll`, {
			longPollSeconds,
			currentRegion,
			sqsRegion,
		});
		const params = {
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 1,
			WaitTimeSeconds: longPollSeconds,
			VisibilityTimeout: visibilityTimeoutSeconds,
		};

		let sqsMessage;
		try {
			const {Messages: messages = []} = await sqsClient
				.receiveMessage(params)
				.promise();
			sqsMessage = messages[0];
		} catch (e) {
			logger.error(
				`AWS connection error attempting to receive SQS messages on queue "${queueUrl}". Waiting for ${backoffSeconds}s before attempting to reconnect. Err: ${e}`
			);
			setTimeout(() => {
				pollMessages(queueUrl, handler);
			}, backoffSeconds * 1000);
			return;
		}

		if (sqsMessage) {
			const {
				Body: body,
				ReceiptHandle: receiptHandle,
				...messageMetadata
			} = sqsMessage;
			const {Message: message} = JSON.parse(body);
			let success = true;
			logger.info('Invoking handler for message from queue', {
				messageMetadata,
				queueUrl,
			});
			try {
				await invokeHandler(handler, message, messageMetadata);
			} catch (e) {
				success = false;
				logger.error(
					'Failure handling message',
					{messageMetadata, queueUrl},
					e
				);
			}

			if (success) {
				const deleteParams = {
					QueueUrl: queueUrl,
					ReceiptHandle: receiptHandle,
				};
				logger.debug('Removing successfully processed message', {
					messageMetadata,
				});
				await sqsClient.deleteMessage(deleteParams).promise();
			}
		} else {
			// console.log(`no messages this time...`);
		}

		setTimeout(() => {
			// we rely on the long poll timeout working to prevent an infinite loop
			// to prevent something unforeseen saturating the process, we restrict polling
			// to max once per-second.
			pollMessages(queueUrl, handler);
		}, 1000);
	}

	function deregister() {
		closed = true;
	}

	return {
		deregister,
		addQueueHandler(queueUrl, handler) {
			if (!enabled) {
				logger.warn(`Attempting to add handler for ${queueUrl} when disabled.`);
			} else {
				pollMessages(queueUrl, handler);
			}
			return this;
		},
	};
}

module.exports = {
	createHandler,
};
