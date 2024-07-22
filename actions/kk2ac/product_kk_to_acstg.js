const { Core } = require('@adobe/aio-sdk')
const {
    errorResponse,
    stringParameters,
    checkMissingRequestInputs
} = require('../utils')
const { getCommerceOauthClient } = require('../oauth1a')
const { processControl } = require("../../lib/commerce/process_control")
const { productSync } = require("../../lib/commerce/product")
const constants = require("../../lib/commerce/constants")
const { getKineticRestClient } = require("../../lib/kinetic/restv2")

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
    // create a Logger
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

    try {
        // 'info' is the default level if not set
        logger.info('Calling the product sync action')

        // log parameters, only if params.LOG_LEVEL === 'debug'
        logger.debug(stringParameters(params))

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
        const productsync = productSync(oauth, logger)
        const processcontrol = processControl(oauth, logger)

        // call AC API to search if there is any process are running.
        const runningProcesses = await processcontrol.findRunningProcessByTask(constants.PRODUCT_SYNC_KK_TO_STG_TASK)
        // console.log(runningProcesses)
        if (runningProcesses.total_count > 0) {
            logger.info("Warning: There are " + runningProcesses.total_count + " product sync from KK staging to AC staging process running. Please check the log.")
            const response = {
                statusCode: 500,
                body: JSON.stringify({
                    "error": "Warning: There are " + runningProcesses.total_count + " product sync from KK staging to AC staging process running. Please check the log."
                })
            }
            return response;
        }

        /* 
          call AC API to insert a processing record in aio_ac_erp_sync_log (id will be in the response)
          {{ _.COMMERCE_BASE_URL }}/rest/default/V1/aioacerpsynclog 
        */
        let process = await processcontrol.insertProcess(
            constants.PRODUCT_SYNC_KK_TO_STG_TASK,
            "Retrieving products from Kinetic to AC staging"
        )
        logger.info(process)

        /* 
          call kinetic products staging table api
          {{ _.KINETIC_API_URL }}/KineticTestWeb/api/v2/odata/RB/BaqSvc/RBk22_Web_Products/Data?$count=true&$top=10&$skip=0
          use the while loop to get all data from staging table
          retrieve 20 records at a time 
        */
        const kkRestClient = getKineticRestClient(
            {
                url: params.KINETIC_API_URL,
                kineticCompany: params.KINETIC_COMPANY,
                xApiKey: params.KINETIC_X_API_KEY,
                license: params.KINETIC_LICENSE,
                username: params.KINETIC_USERNAME,
                password: params.KINETIC_PASSWORD,
                clientCert: params.KINETIC_CLIENT_CERT,
                clientKey: params.KINETIC_CLIENT_KEY
            },
            logger
        )

        let skip = 0
        let top = constants.PRODUCT_SYNC_KK_TO_STG_BATCH_COUNT
        let kkStagingProducts = await kkRestClient.getStagingProducts(skip, top)
        // console.log(kkStagingProducts)
        const totalCount = kkStagingProducts["@odata.count"];
        let retrievedCount = kkStagingProducts["value"].length;
        // logger.info(totalCount)
        if (totalCount > 0) {
            // Retrieve all mappings
            let attributeMappings = await productsync.retrieveAttributeMappings(["N","O","F","W"]);
            // Insert the retrieved data from Kinetic API to staging table aio_ac_erp_product_master
            let insertedProductMaster = await productsync.insertProductMaster(kkStagingProducts["value"], attributeMappings, true)

            while (retrievedCount < totalCount) {
                skip = skip + top
                kkStagingProducts = await kkRestClient.getStagingProducts(skip, top, false)
                retrievedCount = retrievedCount + kkStagingProducts["value"].length
                // Insert the retrieved data from Kinetic API to staging table aio_ac_erp_product_master
                let insertedProductMaster = await productsync.insertProductMaster(kkStagingProducts["value"], attributeMappings, false)

            }
            let stagingTableProcessedResult = await kkRestClient.setStagingTableProcessed("dbo.Web_Export_Products");
        } else {
            logger.info("No data from STAGING API")
        }

        // update the process in aio_ac_erp_sync_log to warning, complete, or failed
        process.last_end_dt = new Date().toISOString().slice(0, 19).replace('T', ' ')
        process.sync_status = constants.SYNC_STATUS_COMPLETE
        process.sync_notes = `Total ${retrievedCount} product records are retrieved from KK STAGING to AC STAGING`
        process = await processcontrol.updateProcess(process)
        logger.info(process)

        const response = {
            statusCode: 200,
            body: process.sync_notes
        }

        // log the response status code
        logger.info(`${response.statusCode}: successful request`)
        return response
    } catch (error) {
        // log any server errors
        logger.error(error)
        // return with 500
        return errorResponse(500, 'server error', logger)
    }
}

exports.main = main
