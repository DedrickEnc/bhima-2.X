/**
 * @class StockFinanceWriter
 * @description 
 * 
 * This class has as purpose to provide all necessary information to let
 * the main stock controller write any financial writting related to the 
 * stock management. 
 * 
 * Managing stock includes many operation financially, the very common thing is to 
 * write on the posting journal to make stock account reflect the physical quantity
 * of the stock.
 * 
 * The constructor of the class will receive a token of insertion to the table
 * something like INSERT INTO table content of the insertion are provided by appropriated
 * methods.
 * 
 * The writting will increase or decrease the stock account as it is a entry or an exit  
 * 
 * @requires ../inventory/inventory/core
 **/

const inventoryCore = require('../inventory/inventory/core');
class StockFinanceWriter {

    /**
     * @constructs
     * 
     * During the object creation, the entity is needed to distinguish
     * which table is concerned by the operation and the value of the entity 
     * variable is provided by the component which requires the StockFinanceWriter
     * object
     **/
    constructor(entity) {
        this.entity = entity;
    }

    /**
     * @method writePurchase
     * 
     * @description
     * 
     * This method is fired when a stock must be entered from a purchase order
     * at this step, we consider the purchase order is already confirmed.
     * 
     * This method will debit the 3 account (in theory) or the stock account (in reality)
     * and will credit the variation account which is the expense account commonly
     * BHIMA is so flexible, the user can choose the stock account and expense account as he neede
     * 
     * This operation will be repeat for each lot item in the list, so if we have n item in the list
     * of lot then we will have 2n writting in the journal. so the method will send an array of 2n elements
     * back to the main controller.
     * 
     * @param lotList {Array} : an array of object representing lot.
     * @param metadata {Object} : should contains the :
     * - uuid : uuid of the docuement
     * - date : date of confirmation
     * - user : Id of the user who performs the operation 
     **/
    writePurchase(metadata, lotList) {
        // making sure we are about to work on an array
        const lots = [].concat(lotList);
        const lines = [];

        var inventory_uuids = lotList.map(function (item) {
            return item.inventory_uuid;
        });

        this.inventoriesDetails(inventory_uuids, true)
            .then(function (detailsList) {
                //building object to make persistent

                lots.forEach(function (lot) {
                    var obj = {
                        uuid,
                        account_id,
                        debit,
                        credit,
                        debit_equiv,
                        credit_equiv,

                        project_id,
                        fiscal_year_id,
                        period_id,
                        trans_id,
                        trans_date,
                        record_uuid,
                        description,                        
                        currency_id,
                        entity,
                        reference_uuid,
                        comment,
                        origin_id,
                        user_id,                       
                    }

                    lines.push(obj);
                });


                console.log('resultat', res);
            });
    }

    /**
     * @method inventoriesDetails
     * 
     * @description
     * 
     * This method a list of inventries and their details
     * 
     * @param inventory_uuids {Array} list of inventries uuids
     * 
     **/
    inventoriesDetails(inventory_uuids, asObject) {
        return inventoryCore.getItemsMetadata({ inventory_uuids })
            .then(function (data) {
                if (asObject) {
                  return data.reduce(function (obj, item) {
                    obj[item.uuid] = item;
                    return obj;
                  }, {});
                }
                return data;
            })
            .catch(function (err) {
                console.log(err);
            });
    }
}

module.exports = StockFinanceWriter;