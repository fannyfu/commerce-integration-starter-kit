module.exports = Object.freeze({
    SYNC_STATUS_PROCESSING: "processing",
    SYNC_STATUS_WARNING: "warning",
    SYNC_STATUS_COMPLETE: "complete",
    SYNC_STATUS_FAILED: "failed",
    PRODUCT_SYNC_TASK: "product_kk_to_ac",
    PRICE_SYNC_BATCH_COUNT: 20,
    INVENTORY_SYNC_BATCH_COUNT: 50, // Not being used.
    
    PRODUCT_SYNC_KK_TO_STG_TASK: "prod_kk_to_acstg",
    PRODUCT_SYNC_KK_TO_STG_BATCH_COUNT: 1000, // Extract 10863 records from Kinetic API to Adobe Commerce STAGING table in about 2 mins.
    PRODUCT_SYNC_STG_TO_AC_TASK: "prod_acstg_to_ac",
    PRODUCT_SYNC_STG_TO_AC_BATCH_COUNT: 10,
    PRODUCT_SYNC_STG_TO_AC_PROCESS_COUNT: 200, // How many total products will be processed in one cron job

    PRICE_SYNC_KK_TO_STG_TASK: "price_kk_to_acstg",
    PRICE_SYNC_KK_TO_STG_BATCH_COUNT: 1000,
    PRICE_SYNC_STG_TO_AC: "price_acstg_to_ac",
    PRICE_SYNC_STG_TO_AC_BATCH_COUNT: 10,
    PRICE_SYNC_STG_TO_AC_PROCESS_COUNT: 500, // How many total product price will be processed in one cron job

    INVENTORY_SYNC_KK_TO_STG_TASK: "stock_kk_to_acstg",
    INVENTORY_SYNC_KK_TO_STG_BATCH_COUNT: 1000,
    INVENTORY_SYNC_SYNC_STG_TO_AC: "stock_acstg_to_ac",
    INVENTORY_SYNC_STG_TO_AC_BATCH_COUNT: 10,
    INVENTORY_SYNC_STG_TO_AC_PROCESS_COUNT: 500,

    COMPANY_SYNC_KK_TO_STG_TASK: "company_kk_to_acstg",
    COMPANY_SYNC_KK_TO_STG_BATCH_COUNT: 100,

    CONTACT_SYNC_KK_TO_STG_TASK: "contact_kk_to_acstg",
    CONTACT_SYNC_KK_TO_STG_BATCH_COUNT: 100,

    CC_SYNC_STG_TO_AC: "cc_acstg_to_ac",
    CC_SYNC_STG_TO_AC_BATCH_COUNT: 10,
    CC_SYNC_STG_TO_AC_PROCESS_COUNT: 500,

    AIOACERPSYNCLOG_URI: 'aioacerpsynclog',
    AIOPRODUCTATTRIBUTEMAPPING_URI: 'aioproductattributemapping',
    AIOPRODUCTMASTER_URI: 'aioproductmaster',
    AIOPRODUCTPRICE_URI: 'aioproductprice',
    AIOPRODUCTINVENTORY_URI: 'aioproductinventory',
    AIOACERPCOMPANY_URI: 'aioacerpcompany',
    AIOACERPCONTACT_URI: 'aioacerpcontact',
    PRODUCTATTRIBUTE_URI: 'products/attributes',
    PRODUCT_BASE_PRICE: 'products/base-prices', // https://adobe-commerce.redoc.ly/2.4.6-admin/tag/productsbase-prices#operation/PostV1ProductsBaseprices
    PRODUCT_TIER_PRICE: 'products/tier-prices',
    PRODUCT_TIER_PRICE_DELETE: 'products/tier-prices-delete', // https://adobe-commerce.redoc.ly/2.4.6-admin/tag/productstier-prices-delete#operation/PostV1ProductsTierpricesdelete
    PRODUCT_INVENTORY_SOURCE_ITEM: 'inventory/source-items',
    CONTACT_URI: 'customers',
    PRODUCT_URI: 'products',
    PRODUCT_REQUIRED_ATTRIBUTE_MAPPINGS: {
        "sku": "part_number",
        "name": "description",
        "kinetic_description": "description",
        "weight": "gross_weight",
        "status": "web_active"
    },
    INVENTORY_REQUIRED_ATTRIBUTE_MAPPINGS: {
        "sku": "part_number",
        "qty": "sellable_qty",
        "source_code": "plant"
    },
    LIST_PRICE_REQUIRED_ATTRIBUTE_MAPPINGS: {
        "sku": "part_number",
        "price": "unit_price"
    },
    TIER_PRICE_REQUIRED_ATTRIBUTE_MAPPINGS: {
        "sku": "part_number",
        "price": "unit_price",
        "qty": "quantity"
    },
    CONTACT_REQUIRED_ATTRIBUTE_MAPPINGS: {
        "firstname": "first_name",
        "lastname": "last_name",
        "email": "email_address"
    }
});