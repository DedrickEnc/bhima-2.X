angular.module('bhima.services')
  .service('TransactionService', TransactionService);

TransactionService.$inject = ['util', 'uiGridConstants', 'bhConstants', 'NotifyService'];

/**
 * Transactions Service
 *
 * This service is responsible for fetching transactions from a datasource
 * and providing a number of utility methods for manipulating and framing this
 * information.
 *
 * NOTE: this requires that both cellNav and edit features are enabled on the
 * ui-grid.
 *
 *
 * @todo split into util and save logic
 *
 * @requires util
 * @requires uiGridConstants
 */
function TransactionService(util, uiGridConstants, bhConstants, Notify) {

  var ROW_EDIT_FLAG = bhConstants.transactions.ROW_EDIT_FLAG;
  var ROW_HIGHLIGHT_FLAG = bhConstants.transactions.ROW_HIGHLIGHT_FLAG;
  var ROW_INVALID_FLAG = bhConstants.transactions.ROW_INVALID_FLAG;

  // allow or block editing multiple transactions simultaneously
  var MULTIPLE_EDITS = false;

  // convert arguments to an array
  function toArray(args) {
    return Array.prototype.slice.call(args);
  }

  /**
   * @function indexBy
   *
   * @description
   * Maps an array of objects to an object keyed by the particular property
   * provided, mapping to indices in the array.  It's somewhat tied to ui-grid's
   * implementation of rows entities.
   *
   * @param {Array} array - the array to index
   * @param {String} property - the key to index the array's contents by.
   * @returns {Object} - an object of value -> array indices
   *
   * @private
   */
  function indexBy(array, property) {
    return array.reduce(function (aggregate, row, index) {
      var key = row.entity[property];

      // header rows do not have keys
      if (!key) { return aggregate; }

      aggregate[key] = aggregate[key] || [];
      aggregate[key].push(index);

      return aggregate;
    }, {});
  }

  /**
   * @function cellEditableCondition
   *
   * @description
   * Only allows rows to be edited if they have been marked by the ROW_EDIT_FLAG.
   * This should be bound to the cellEditableCondition of gridOptions.
   *
   * @private
   */
  function cellEditableCondition($scope) {
    return $scope.row[ROW_EDIT_FLAG];
  }

  // sets the allowCellFocus parameter on grid's column definitions
  function setColumnCellNav(column) {
    column.allowCellFocus = this._cellNavEnabled;
  }

  // called after the cellNavigationEnabled trigger is fired
  function registerCellNavChange() {
    angular.forEach(this.gridOptions.columnDefs, setColumnCellNav.bind(this));
    this.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
  }

  /**
   * @constructor
   */
  function Transactions(gridOptions) {
    this.gridOptions = gridOptions;

    // a mapping of record_uuid -> array indices in the rendered row set
    this.transactionIndices = {};

    // this array stores the transactions ids currently being edited.
    this._entity = null;
    // this._edits = [];

    gridOptions.cellEditableCondition = cellEditableCondition;
    gridOptions.enableCellEditOnFocus = true;

    util.after(gridOptions, 'onRegisterApi', function onRegisterApi(api) {
      this.gridApi = api;

      window.myapi = api;
      this.gridApi.edit.on.afterCellEdit(null, function (rowEntity, colDef, newValue, oldValue) {
        console.log('Updated', colDef.name, 'from', oldValue, 'to', newValue);
      });

      var scope = this;

      // console.log('INITIAL INIT', this);
			api.grid.registerRowsProcessor(function (rows) {

        console.log('row processor', rows);
        // console.log('rp', this._entity);
        if (this._entity) {
          // console.log('set property for edits', this._entity);
          setPropertyOnTransaction.call(this, this._entity.uuid, ROW_EDIT_FLAG, true);
        }
        // console.log('rows processor', rows.length);
        // console.log(api.grid.rows.length);
        return rows;
      }.bind(this), 410);

      // cellNav is not enabled by default
      // this.disableCellNavigation();

      // on each row rendering, recompute the transaction row indexes
      // api.core.on.rowsRendered(null, createTransactionIndexMap.bind(this));
      api.core.on.rowsRendered(null, function (rows) { console.log('rows rendered'); });

      api.grid.registerDataChangeCallback(function (rows) {
        console.log('data change rows', rows);
        createTransactionIndexMap.bind(scope)();
        // console.log(scope.transactionIndices);
        // console.log('row data change');
      }, [uiGridConstants.dataChange.ROW]);

      // console.log(uiGridConstants);
    }.bind(this));
  }


  /**
   * @function enableCellNavigation
   *
   * @description
   * Enables cell navigation on the underlying grid.
   *
   * @public
   *
   */
  Transactions.prototype.enableCellNavigation = function enableCellNavigation() {
    this._cellNavEnabled = true;
    registerCellNavChange.call(this);
  };

  /**
   * @function disableCellNavigation
   *
   * @description
   * Disables and clears the focused cell navigation for a better UX while working
   * with complex grids.
   *
   * @public
   *
   */
  Transactions.prototype.disableCellNavigation = function disableCellNavigation() {
    this._cellNavEnabled = false;
    registerCellNavChange.call(this);

    // clear the focused element for a better UX
    this.gridApi.grid.cellNav.clearFocus();
  };

  /**
   * @function createTransactionIndexMap
   *
   * @description
   * Creates the transaction index mapping for easy lookup of transactions.
   * This is an internal method that is called on every rowRendered() call.
   *
   * @private
   */
  function createTransactionIndexMap() {
    var rows = this.gridApi.grid.rows;
    this.transactionIndices = indexBy(rows, 'record_uuid');

    console.log('created index', this.transactionIndices);
  }

  /**
   * @function getTransactionRows
   *
   * @description
   * Efficiently return transaction rows (but not header rows) in a transaction
   * given the record_uuid using the transaction index mapping.
   *
   * @param {String} uuid - the record_uuid of the transaction
   * @return {Array} rows - the rows in the grid used to render that transaction.
   */
  Transactions.prototype.getTransactionRows = function getTransactionRows(uuid) {

    console.log('GET ROWS:USING:', this.gridApi.grid.rows);
    // console.log('get rows', this, uuid);
    var array = this.gridApi.grid.rows;
    var indices = this.transactionIndices[uuid] || [];

    console.log('using indices', indices);

    // return an array of transaction rows.  These are bound to the grid, despite
    // being a new array.
    return indices.map(function (index) {
      return array[index];
    });
  };


  /**
   * @method validate
   *
   * @description
   * A method to validate individual transactions by their record uuid.  If no records
   * uuids are passed in, it will validate all transactions in the grid.
   */
  Transactions.prototype.validate = function validate(uuid) {

    // if no uuid is passed in, call with all uuids indexed
    if (!uuid) {
      this.validate.apply(this, Object.keys(this.indexBy));
    }

    var rows = this.getTransactionRows(uuid);

    // @TODO - custom logic to validate that debits/credits balance, etc
    return true;
  };

  // helper functions to get parent row (group header) from a child row
  function getParentNode(row) {
    return row.treeNode.parentRow;
  }

  // helper functions to get child row record_uuid from the first child row.
  // Note: if we want to support multiple groups, this should take the last
  // child to avoid getting another group header.
  function getChildRecordUuid(row) {
    var child = row.treeNode.children[0].row;
    return child.entity.record_uuid;
  }

  /**
   * @function setPropertyOnTransaction
   *
   * @description
   * This function toggles a single property on the transaction rows.  It must
   * be called with `.call()` or `.bind()` to properly set the `this` variable.
   *
   * @param {String} uuid - the transaction's record_uuid
   * @param {String} property - the property to set on each transaction row
   * @param {Any} value - any value to set on the transaction
   *
   * @private
   */
  function setPropertyOnTransaction(uuid, property, value) {
    var rows = this.getTransactionRows(uuid);
    var visible = false;

    console.log('updating property on rows', rows);

    // loop through all rows to set the transactions
    rows.forEach(function (row) {
      if (row.entity.record_uuid === uuid) {
        row[property] = value;


        // This will check to see if any of the rows in a transaction are visible
        if (row.visible) { visible = true; }

        // set the transaction property with the same record
        // var parent = getParentNode(row);
        // parent[property] = value;
      }
    });

    // ensure this flag is only set if the transaction row header exists
    // all rows are made 'children' of a row header - even if their transaction header does not exist
    if (visible) {
      getParentNode(rows[0])[property] = value;
    }
    // make sure the grid updates with the changes
    // this.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
  }


  /**
   * @method scrollIntoView
   *
   * @description
   * Scrolls a transaction group into view by ensuring the last row is visible.
   */
  Transactions.prototype.scrollIntoView = function scrollIntoView(uuid) {
    var rows = this.getTransactionRows(uuid);
    var lastRowInView = rows[rows.length - 1];
    this.gridApi.core.scrollTo(lastRowInView.entity);
  };

  /**
   * @method invalidate
   *
   * @param {String} uuid - the record_uuid of the transaction to invalidate.
   */
  Transactions.prototype.invalidate = function invalidate(uuid) {
    setPropertyOnTransaction.call(this, uuid, '_invalid', true);
  };

  /**
   * @method edit
   *
   * @description
   * This function sets the ROW_EDIT_FLAG property on all transactions matching the
   * provided uuid.  It also scrolls the transaction into view if necessary.
   *
   * @param {String|Object} uuid - either a row or a record_uuid of the
   *   transaction to be edited.  If a row is passed in, the record_uuid is
   *   inferred from the child rows.
   */
  Transactions.prototype.edit = function edit(uuid) {
    var api = this.gridApi;

    if (this.isEditing() && !MULTIPLE_EDITS) {
      Notify.warn('JOURNAL.SINGLE_EDIT_ONLY');
      return;
    }

    // if a row is passed in, resolve the row to the child record_uuid
    if (angular.isObject(uuid)) {
      uuid = getChildRecordUuid(uuid);
    }

    if (!this._cellNavEnabled) {
      this.enableCellNavigation();
    }

    setPropertyOnTransaction.call(this, uuid, ROW_EDIT_FLAG, true);
    this.scrollIntoView(uuid);
    this._entity = {
      uuid : uuid,
      rows : this.getTransactionRows(uuid),
      aggregates : {}
    };
    this._entity.trans_id = this._entity.rows[0].entity.trans_id;
    this.digestAggregates();
    // console.log('entity', this._entity);

    // @sfount proposal
    // 1. Download transaction information seperate from current view
    // 2. Show entity information in edit bar
    // 3. Ensure whenever filters or searches are applied that styles and edit classes are updated
  };

  Transactions.prototype.digestAggregates = function digestAggregates () {
    this._entity.aggregates.totalRows = this._entity.rows.length;
    this._entity.aggregates.credit = this._entity.rows.reduce(function (a, b) {
      return a + b.entity.credit;
    }, 0);
    this._entity.aggregates.debit = this._entity.rows.reduce(function (a, b) {
      return a + b.entity.debit;
    }, 0);

  };


  // This function should be called whenever the underlying model changes
  // (i.e a new search) to ensure that the latest transactions changes are applied
  Transactions.prototype.applyEdits = function applyEdits () {
     console.log('apply edits');
    this.transactionIndices = {};
    // this.gridApi.core.notifyDataChange(uiGridConstants.dataChange.ROW);
    // createTransactionIndexMap.bind(this)();
  }



  /**
   * @method save
   *
   * @description
   * This function saves all transactions by
   */
  Transactions.prototype.save = function save() {

    // @TODO validate()

    // console.log('saving, using');
    // console.log(this._edits);
    // console.log(this.getTransactionRows(this._edits[0]));

    // remove the ROW_EDIT_FLAG property on all transactions
    // this._edits.forEach(function (uuid) {
    setPropertyOnTransaction.call(this, this._entity.uuid, ROW_EDIT_FLAG, false);
    // }.bind(this));

    // set the edits length to 0
    // this._edits.length = 0;
    this._entity = null;
    // disable cell navigation
    this.disableCellNavigation();

  };

  /**
   * @method isEditing
   *
   * @description
   * Returns a boolean indicating if a transaction is being edited or not.
   *
   * @returns {Boolean} - True if there is a transaction being edited, false
   *   otherwise.
   */
  Transactions.prototype.isEditing = function isEditing() {
    return this._entity !== null;
    // return this._edits.length > 0;
  };

  /**
   * @method print
   *
   * @description
   * This function allows the controller to print the selected uuid.
   */
  Transactions.prototype.print = function print(uuid) {
    // noop()
  };

  return Transactions;
}
