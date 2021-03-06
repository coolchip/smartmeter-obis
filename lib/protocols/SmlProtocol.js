var OpenSml = require('open-sml');
var ObisMeasurement = require('../ObisMeasurement');


var regCompleteMsg = new RegExp('(1b1b1b1b01010101.*1b1b1b1b.{8})$');

function SmlProtocol(options, storeCallback) {
    this.options = options;
    this.storeCallback = storeCallback;
}

SmlProtocol.prototype.initState = function initState() {
    //this.lastMessage = undefined; not used in this case, nothing to do because only handling full messages
};

SmlProtocol.prototype.isProcessComplete = function isProcessComplete() {
    return true; // Only receiving and one step, so nothing to do here
};

SmlProtocol.prototype.messagesToSend = function messagesToSend() {
    return 0; // we will not send out any messages
};

SmlProtocol.prototype.getNextMessage = function getNextMessage(commObj, callback) {
    callback('');
    return; // we will not send out any messages
};

SmlProtocol.prototype.checkMessage = function checkMessage(message) {
    message = message.toString('hex');
    var regMessage = message.match(regCompleteMsg);
    if (this.options.debug === 2) this.options.logger('MATCH-RESULT MESSAGE: ' + JSON.stringify(message) + ' -> ' + JSON.stringify(regMessage));
    return (regMessage && regMessage[1] !== '');
};

SmlProtocol.prototype.handleMessage = function handleMessage(message) {
    message = message.toString('hex');
    var regMessage = message.match(regCompleteMsg);
    if (!regMessage || !regMessage[1]) {
        throw new Error('Message ' + message + 'invalid');
    }

    var smlFile = new OpenSml.SmlFile();

    try {
        smlFile.parse(new Buffer(regMessage[1], 'hex'));
    }
    catch (err) {
        smlFile = null;
        throw new Error('Error while parsing SML message: ' + err + ': Message: ' + regMessage[1]);
    }

    if (this.options.debug === 2) this.options.logger('SML MESSAGE: ' + smlFile.toString());

    var result = {};
    var crcCheck = true; // we ignore whole-Message CRC (smlFile.valid;) only check detail CRCs
    if (crcCheck) {
        for (var msg in smlFile.messages) {
            if (smlFile.messages[msg].getMessageTag() === OpenSml.Constants.GET_LIST_RESPONSE) {
                crcCheck &= smlFile.messages[msg].isValid();
                if (smlFile.messages[msg].isValid()) Object.assign(result, this.prepareResult(smlFile.messages[msg].getMessageBody().getValList()));
            }
            else if (smlFile.messages[msg].getMessageTag() === OpenSml.Constants.GET_PROFILE_LIST_RESPONSE) {
                crcCheck &= smlFile.messages[msg].isValid();
                if (smlFile.messages[msg].isValid()) Object.assign(result, this.prepareResult(smlFile.messages[msg].getMessageBody().getPeriodList()));
            }
    	}
    }
    if (Object.keys(result).length === 0) {
        if (!crcCheck) {
            if (!this.options.protocolSmlIgnoreInvalidCRC) {
                smlFile = null;
                throw new Error('Message CRC-Check invalid -> no data available');
            }
            else {
                if (this.options.debug !== 0) this.options.logger('CRC MISMATCH IN SML MESSAGE IGNORED!');
            }
        }
    }
    else {
        if (this.options.debug === 2) this.options.logger('STORE DATA');
        if (typeof this.storeCallback === 'function') {
            this.storeCallback(result);
        }
    }

    smlFile = null;
    return null; // ignore pot. other data in message ... we use the next message
};

SmlProtocol.prototype.prepareResult = function prepareResult(list) {
    var result = {};
    for (var i = 0; i < list.getLength(); i++) {
        var entry = list.getListEntryAt(i);
        var obis = new ObisMeasurement(entry.getObjName());
        var value = entry.getValue();
        var unit = entry.getUnit();
        if (typeof value === 'number' && entry.getScaler()) {
            value *= Math.pow(10,entry.getScaler());
        }
        obis.addValue(value, unit);
        result[obis.idToString()]=obis;
    }
    return result;
};

module.exports = SmlProtocol;
