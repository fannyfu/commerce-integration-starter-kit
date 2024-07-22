const { Core } = require('@adobe/aio-sdk')
const {
    errorResponse,
    stringParameters,
    checkMissingRequestInputs
} = require('../utils')
const { getCommerceOauthClient } = require('../oauth1a')
const { processControl } = require("../../lib/commerce/process_control")
const { priceSync } = require("../../lib/commerce/price")
const constants = require("../../lib/commerce/constants")

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
    // create a Logger
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

    try {
        // 'info' is the default level if not set
        logger.info('Calling the product price sync from AC staging to AC action')

        // log parameters, only if params.LOG_LEVEL === 'debug'
        // logger.debug(stringParameters(params))

        // check for missing request input parameters and headers
        const requiredParams = [/* add required params */]
        // const requiredHeaders = ['Authorization']
        const requiredHeaders = []
        const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)

        if (errorMessage) {
            // return and log client errors
            return errorResponse(400, errorMessage, logger)
        }

        /*
          Todo:
          check for required env variables
          if missing required env variables return and log server errors
        */

        // init the commerce oauth client
        const oauth = getCommerceOauthClient(
            {
                url: params.COMMERCE_BASE_URL,
                consumerKey: params.COMMERCE_CONSUMER_KEY,
                consumerSecret: params.COMMERCE_CONSUMER_SECRET,
                accessToken: params.COMMERCE_ACCESS_TOKEN,
                accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET
            },
            logger
        )
        const pricesync = priceSync(oauth, logger)
        const processcontrol = processControl(oauth, logger)

        // Check if there is any product inventory records needs to be updated.
        let currentPage = 1
        let pageSize = constants.PRICE_SYNC_STG_TO_AC_BATCH_COUNT
        let productPrices = await pricesync.getProductPrices(pageSize, currentPage)
        const totalCount = productPrices["total_count"];
        const totalBatches = Math.min(totalCount, constants.PRICE_SYNC_STG_TO_AC_PROCESS_COUNT) / pageSize;
        let retrievedCount = productPrices["items"].length;
        logger.info(`Total ${totalCount} product price records needs to be processed.`)
        logger.info(`Retrieved ${retrievedCount} product price records to be processed in page ${currentPage}.`)
        if (totalCount > 0) {
            // call AC API to search if there is any process are running.
            const runningProcesses = await processcontrol.findRunningProcessByTask(constants.PRICE_SYNC_STG_TO_AC)
            // console.log(runningProcesses)
            if (runningProcesses.total_count > 0) {
                logger.info("Warning: There are " + runningProcesses.total_count + " product price sync from AC staging to AC process running. Please check the log.")
                const response = {
                    statusCode: 500,
                    body: JSON.stringify({
                        "error": "Warning: There are " + runningProcesses.total_count + " product price sync from AC staging to AC process running. Please check the log."
                    })
                }
                return response;
            }

            /*
            call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
            {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog
            */
            let process = await processcontrol.insertProcess(
                constants.PRICE_SYNC_STG_TO_AC,
                "Retrieving products prices records from AC staging to create/update products prices in AC"
            )
            // logger.info(process)
            let acPriceSync = await pricesync.updateProductPriceToAc(productPrices["items"])
            let processedPage = 1
            while (
                retrievedCount < totalCount && 
                retrievedCount < constants.PRICE_SYNC_STG_TO_AC_PROCESS_COUNT
            ) {
                processedPage += 1
                productPrices = await pricesync.getProductPrices(pageSize, currentPage)
                retrievedCount = retrievedCount + productPrices["items"].length
                acPriceSync = await pricesync.updateProductPriceToAc(productPrices["items"])
                if (processedPage > totalBatches) {
                    break;
                }
            }
            // update the process in aio_ac_erp_sync_log to warning, complete, or failed
            process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
            process.sync_status = constants.SYNC_STATUS_COMPLETE
            process.sync_notes = `Total ${totalCount} product prices records need to be processed. ${retrievedCount} product prices records have been prodessed in this batch.`
            process = await processcontrol.updateProcess(process)
            const response = {
                statusCode: 200,
                body: process.sync_notes
            }
            logger.info(JSON.stringify(response))
            return response
        } else {
            const notes = "No data in AC staging table to be processed for product price.";
            const response = {
                statusCode: 200,
                body: notes
            }
            logger.info(JSON.stringify(response))
            return response
        }

    //     // call AC API to search if there is any process are running.
    //     const runningProcesses = await processcontrol.findRunningProcessByTask(constants.PRODUCT_SYNC_STG_TO_AC_TASK)
    //     // console.log(runningProcesses)
    //     // if (runningProcesses.total_count > 0) {
    //     //     logger.info("Warning: There are " + runningProcesses.total_count + " product price sync from AC staging to AC process running. Please check the log.")
    //     //     const response = {
    //     //         statusCode: 500,
    //     //         body: JSON.stringify({
    //     //             "error": "Warning: There are " + runningProcesses.total_count + " product price sync from AC staging to AC process running. Please check the log."
    //     //         })
    //     //     }
    //     //     return response;
    //     // }

    //     /*
    //       call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
    //       {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog
    //     */
    //     let process = await processcontrol.insertProcess(
    //         constants.PRODUCT_SYNC_STG_TO_AC_TASK,
    //         "Retrieving products price from AC staging to create/update products price in AC"
    //     )
    //     logger.info(process)

    //     let currentPage = 1
    //     let pageSize = constants.PRICE_SYNC_BATCH_COUNT
    //     let productPrices = await pricesync.getProductPrices(pageSize, currentPage)
    //    // logger.info(JSON.stringify(productMasters))
    //     const totalCount = productPrices["total_count"];
    //     let retrievedCount = productPrices["items"].length;
    //     logger.info('product price records ' + totalCount)
    //     if (totalCount > 0) {
    //         let acPriceSync = await pricesync.updateProductPriceToAc(productPrices["items"])
    //         while (retrievedCount < totalCount && retrievedCount < constants.PRICE_SYNC_STG_TO_AC_PROCESS_COUNT) {
    //             currentPage += 1
    //             productPrices = await pricesync.getProductPrices(pageSize, currentPage)
    //             retrievedCount = retrievedCount + productPrices["items"].length
    //             acPriceSync = await pricesync.updateProductPriceToAc(productPrices["items"])
    //         }
    //     } else {
    //         logger.info("No data from AC STAGING API")
    //     }

    //     // update the process in aio_ac_erp_sync_log to warning, complete, or failed
    //     process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    //     process.sync_status = constants.SYNC_STATUS_COMPLETE
    //     process.sync_notes = `Total ${totalCount} products needs to be processed. ${retrievedCount} products are prodessed in this batch.`
    //     process = await processcontrol.updateProcess(process)
    //     logger.info(process)

    //     const response = {
    //         statusCode: 200,
    //         body: process.sync_notes
    //     }

    //     // log the response status code
    //     logger.info(`${response.statusCode}: successful request`)
    //     return response
    } catch (error) {
        // log any server errors
        logger.error(error)
        // return with 500
        return errorResponse(500, 'server error', logger)
    }
}

exports.main = main
