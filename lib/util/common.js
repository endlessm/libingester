// eslint-disable-next-line no-nested-ternary
'use strict';

/** @module util/common */

/**
 * Get parsed settings to limit the ingested items.
 *
 * The `maxItems` and `maxDaysOld` parameters can be overridden by the
 * `LIBINGESTER_MAX_ITEMS` and `LIBINGESTER_MAX_DAYS_OLD` environment
 * variables, respectively.
 *
 * @param {number} [desiredMaxItems=Infinity] - Maximum number of entries to ingest
 * @param {number} [desiredMaxDaysOld=1] - Maximum age of entries to ingest, in days
 * @returns {Object} - Object with parsed settings `max_items` and `oldest_date`
 * @memberof util/common
 */
function getIngestionLimits(desiredMaxItems = Infinity, desiredMaxDaysOld = 1) {
    const actualMaxDaysOld = process.env.LIBINGESTER_MAX_DAYS_OLD || desiredMaxDaysOld;
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - parseInt(actualMaxDaysOld, 10));

    let actualMaxItems = process.env.LIBINGESTER_MAX_ITEMS || desiredMaxItems;
    if (actualMaxItems !== Infinity) {
        actualMaxItems = parseInt(actualMaxItems, 10);
    }

    return {
        max_items: actualMaxItems,
        oldest_date: oldestDate,
    };
}

function delayExecution(timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

module.exports = {
    get_ingestion_limits: getIngestionLimits,
    delayExecution,
};
