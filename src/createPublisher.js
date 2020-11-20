const SNS = require('aws-sdk/clients/sns');
const logger = require('@5app/logger');

function createPublisher(config) {
	const {
		currentRegion,
		snsRegion,
		awsEndpoint,
		// enabled=false allows you to call the methods, but not actually publish anything
		enabled = true,
	} = config;

	const snsClient = new SNS({region: snsRegion, endpoint: awsEndpoint});

	async function sendSNSMessage(topicArn, payload = null) {
		const message = {
			payload,
			fromRegion: currentRegion,
			date: new Date().toISOString(),
		};
		const params = {
			Message: JSON.stringify(message),
			TopicArn: topicArn,
		};
		logger.info(`Publishing message`, {message, topicArn});
		return snsClient.publish(params).promise();
	}

	async function publish(topicArn, payload) {
		if (!enabled) {
			logger.warn(`Attempting to publish to ${topicArn} when disabled.`);
			return;
		}

		return sendSNSMessage(topicArn, payload);
	}

	return {
		publish,
	};
}

module.exports = {
	createPublisher,
};
