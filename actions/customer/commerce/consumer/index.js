/*
 * Copyright 2023 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

/**
 * This is the consumer of the events coming from Adobe Commerce related to customer entity.
 */
const {Core} = require('@adobe/aio-sdk')
const {errorResponse, stringParameters, checkMissingRequestInputs} = require('../../../utils')
const {HTTP_BAD_REQUEST, HTTP_OK, HTTP_INTERNAL_ERROR} = require("../../../constants");
const Openwhisk = require("../../../openwhisk");

async function main(params) {
    const logger = Core.Logger('main', {level: params.LOG_LEVEL || 'info'})
    try {
        const openwhiskClient = new Openwhisk(params.API_HOST, params.API_AUTH);

        let response = {};
        let statusCode = HTTP_OK;

        logger.info('[Customer][Commerce][Consumer] Start processing request');
        logger.debug(`[Customer][Commerce][Consumer] Consumer main params: ${stringParameters(params)}`);

        const requiredParams = ['type', 'data.value.created_at', 'data.value.updated_at']
        const errorMessage = checkMissingRequestInputs(params, requiredParams, []);

        if (errorMessage) {
            logger.error(`[Customer][Commerce][Consumer] Invalid request parameters: ${stringParameters(params)}`);
            return errorResponse(HTTP_BAD_REQUEST, errorMessage, logger);
        }

        logger.info('[Consumer][Commerce][Consumer] Params type: ' + params.type);

        switch (params.type) {
            case "com.adobe.commerce.observer.customer_save_commit_after":
                const createdAt = Date.parse(params.data.value.created_at);
                const updatedAt = Date.parse(params.data.value.updated_at);
                if (createdAt === updatedAt) {
                    logger.info('[Customer][Commerce][Consumer] Invoking created customer');
                    const res = await openwhiskClient.invokeAction("customer-commerce/created", params.data.value);
                    response = res?.response?.result?.body;
                    statusCode = res?.response?.result?.statusCode;
                } else {
                    logger.info('[Customer][Commerce][Consumer] Invoking update customer');
                    const res = await openwhiskClient.invokeAction("customer-commerce/updated", params.data.value);
                    response = res?.response?.result?.body;
                    statusCode = res?.response?.result?.statusCode;
                }
                break;
            case "com.adobe.commerce.observer.customer_delete_commit_after":
                logger.info('[Customer][Commerce][Consumer] Invoking delete customer');
                const res = await openwhiskClient.invokeAction("customer-commerce/deleted", params.data.value);
                response = res?.response?.result?.body;
                statusCode = res?.response?.result?.statusCode;
                break;
            default:
                logger.error(`[Customer][Commerce][Consumer] type not found: ${params.type}`);
                response = `This case type is not supported: ${params.type}`;
                statusCode = HTTP_BAD_REQUEST;
                break;
        }

        logger.info(`[Customer][Commerce][Consumer] ${statusCode}: successful request`)
        return {
            statusCode: statusCode,
            body: {
                type: params.type,
                request: params.data.value,
                response
            }
        }
    } catch (error) {
        return errorResponse(HTTP_INTERNAL_ERROR, `[Consumer][Commerce][Consumer] Server error: ${error.message}`, logger)
    }
}

exports.main = main
