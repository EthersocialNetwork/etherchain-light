var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
var wabt = require('wabt');
var EWASM_BYTES = '0x0061736d01';

function hex2buf(hex) {
    let typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
        return parseInt(h, 16);
    }));
    return typedArray;
}

function wasm2wast(wasmBytecode) {
    let wasmBuf = hex2buf(wasmBytecode);
    let textmodule = wabt.readWasm(wasmBuf, {
        readDebugNames: true
    });
    textmodule.generateNames();
    textmodule.applyNames();
    let wasmAsWast = textmodule.toText({
        foldExprs: true,
        inlineExport: true
    });
    return wasmAsWast;
}

router.get('/:account/:offset?', function (req, res, next) {

    var config = req.app.get('config');
    var web3 = new Web3();
    web3.setProvider(config.provider);
    var db = req.app.get('db');

    var data = {};
    var contractEvents = {};
    var blocks = {};
    data.contractnum = 0;
    async.waterfall([
            function (callback) {
                web3.eth.getBlock("latest", false, function (err, result) {
                    callback(err, result); //마지막 블럭 정보를 받아서 전달
                });
            },
            function (lastBlock, callback) {
                data.nextBlockNumber = lastBlock.number;
                var blockNumber = lastBlock.number;
                if (!req.params.offset) {
                    blockNumber = lastBlock.number;
                } else if (req.params.offset > 100 && req.params.offset < lastBlock.number) {
                    blockNumber = req.params.offset;
                } else if (req.params.offset < 101) {
                    blockNumber = 101;
                } else {
                    blockNumber = lastBlock.number;
                }

                web3.eth.getBlock(blockNumber, false, function (err, result) {
                    callback(err, result); //마지막 블럭 정보를 받아서 전달
                });
            },
            function (targetBlock, callback) {
                data.lastBlock = targetBlock.number;
                web3.eth.getBalance(req.params.account, function (err, balance) {
                    callback(err, balance); //해당 계정의 보유량을 받아서 전달
                });
            },
            function (balance, callback) {
                data.balance = balance;
                web3.eth.getCode(req.params.account, function (err, code) {
                    callback(err, code); //해당 계정의 코드를 받아서 전달
                });
            },
            function (code, callback) {
                data.code = code;
                data.wast = "";
                if (code !== "0x") {
                    data.isContract = true;
                    // do code to wast conversion here
                    if (code.substring(0, 12) === EWASM_BYTES) {
                        var wast = wasm2wast(code.substr(2));
                        data.wast = wast;
                    }
                    /*
                    web3.debug.storageRangeAt(data.lastBlock.toString(), 0, req.params.account, "0x0", 1000, function (err, result) {
                        callback(err, result.storage);
                    });
                    */
                    return callback(null, null);
                } else {
                    return callback(null, null);
                }
            },
            function (storage, callback) {
                if (storage) {
                    var listOfStorageKeyVals = Object.values(storage);
                    data.storage = listOfStorageKeyVals;
                }
                // fetch verified contract source from db
                db.get(req.params.account.toLowerCase(), function (err, value) {
                    callback(null, value); //디비에서 해당 계정의 정보를 가지고 온다.
                });
            },
            function (source, callback) {
                if (source) {
                    data.source = JSON.parse(source);
                    console.log(data.source);
                    data.contractState = [];
                    if (!data.source.abi) {
                        return callback();
                    } else {
                        var abi = JSON.parse(data.source.abi);
                        var contract = web3.eth.contract(abi).at(req.params.account);

                        async.eachSeries(abi, function (item, eachCallback) {
                            if (item.type === "function" && item.inputs.length === 0 && item.constant) {
                                try {
                                    contract[item.name](function (err, result) {
                                        data.contractState.push({
                                            name: item.name,
                                            result: result
                                        });
                                        return eachCallback();
                                    });
                                } catch (e) {
                                    console.log(e);
                                    return eachCallback();
                                }
                            } else {
                                return eachCallback();
                            }
                        }, function (err) {
                            return callback(err, contract);
                        });
                    }
                } else if (data.isContract) {
                    var erc20Contract = web3.eth.contract(config.erc20ABI).at(req.params.account);
                    data.contractState = [];

                    async.eachSeries(config.erc20ABI, function (item, eachCallback) {
                        if (item.type === "function" && item.inputs.length === 0 && item.constant) {
                            try {
                                erc20Contract[item.name](function (err, result) {
                                    data.contractState.push({
                                        name: item.name,
                                        result: result
                                    });
                                    return eachCallback();
                                });
                            } catch (e) {
                                console.log(e);
                                return eachCallback();
                            }
                        } else {
                            return eachCallback();
                        }
                    }, function (err) {
                        return callback(err, erc20Contract);
                    });
                } else {
                    return callback(null, null);
                }
            },
            function (contract, callback) {
                if (contract) {
                    var allEvents = contract.allEvents({
                        fromBlock: 0,
                        toBlock: "latest"
                    });
                    allEvents.get(function (err, events) {
                        if (err) {
                            console.log("Error receiving historical events:", err);
                            callback(err, null);
                        } else {
                            callback(null, events);
                        }
                    });
                } else {
                    callback(null, null);
                }
            },
            function (contractevents, callback) {
                if (contractevents) {
                    async.eachSeries(contractevents, function (event, contracteachCallback) {
                        async.waterfall([
                                function (contractcallback) {
                                    if (event.blockNumber && (event.event === "Transfer" || event.event === "Approval")) {
                                        if (event.args && event.args._value) {
                                            contractcallback(null, event.args._value.toNumber(), event.blockNumber);
                                        } else {
                                            contractcallback(null, null, null);
                                        }
                                    } else {
                                        contractcallback(null, null, null);
                                    }
                                },
                                function (amount, blockNumber, contractcallback) {
                                    //console.log("_value: ", amount, "blockNumber: ", blockNumber);
                                    if (amount) {
                                        event.args._value = amount;
                                        web3.eth.getBlock(blockNumber, false, function (err, block) {
                                            contractcallback(block.timestamp, null);
                                        });
                                    } else {
                                        contractcallback(null, null);
                                    }
                                }
                            ],
                            function (blockTimestamp, err) {
                                //console.dir("blockTimestamp: " + blockTimestamp);
                                if (blockTimestamp) {
                                    event.timestamp = (new Date(blockTimestamp * 1000)).toLocaleString();
                                    if (!contractEvents[data.contractnum]) {
                                        contractEvents[data.contractnum] = [];
                                    }
                                    contractEvents[data.contractnum].push(event);
                                    //console.log("contractEvents[", data.contractnum, "]", contractEvents[data.contractnum]);
                                    data.contractnum++;
                                    //console.log(contractEvents.length + "  --------------async.waterfall----------------");
                                }
                                contracteachCallback();
                            });
                    }, function (err) {
                        callback(err, contractEvents);
                    });
                } else {
                    var totalblocks = [];
                    const devide = 10000;
                    var idxblock;
                    data.previousBlockNumber = 1;
                    data.fromBlock = 1;
                    for (idxblock = data.lastBlock; idxblock > devide; idxblock = idxblock - devide) {
                        totalblocks.push(idxblock);
                    }
                    totalblocks.push(idxblock);
                    async.eachSeries(totalblocks, function (subblocks, outeachCallback) {
                        async.waterfall([
                                function (incallback) {
                                    web3.trace.filter({
                                        "fromBlock": "0x" + (subblocks - devide - 1).toString(16),
                                        "toBlock": "0x" + subblocks.toString(16), //[req.params.account]
                                        "toAddress": [req.params.account]
                                    }, function (err, totraces) {
                                        incallback(err, totraces);
                                    });
                                },
                                function (totraces, incallback) {
                                    web3.trace.filter({
                                        "fromBlock": "0x" + (subblocks - devide - 1).toString(16),
                                        "toBlock": "0x" + subblocks.toString(16), //[req.params.account]
                                        "fromAddress": [req.params.account]
                                    }, function (err, fromtraces) {
                                        incallback(err, totraces, fromtraces);
                                    });
                                },
                                function (totraces, fromtraces, incallback) {
                                    if (Object.keys(blocks).length >= 100) {
                                        return callback(null, null);
                                    }
                                    var traces = totraces.concat(fromtraces);
                                    traces.sort(function (a, b) {
                                        return (a.blockNumber < b.blockNumber) ? 1 : ((b.blockNumber < a.blockNumber) ? -1 : 0);
                                    });
                                    async.eachSeries(traces, function (trace, ineachCallback) {
                                        const num = trace.blockNumber;
                                        trace.isContract = false;
                                        if (trace.type === 'reward') {
                                            web3.eth.getBlock(num, true, function (err, result) {
                                                if (result.transactions.length > 0) {
                                                    var totalGasUsed = result.gasUsed * result.transactions[0].gasPrice;
                                                    //console.log("[1] trace.action.value : ", trace.action.value, totalGasUsed);
                                                    trace.action.value = "0x".concat((parseInt(trace.action.value, 16) + totalGasUsed).toString(16));
                                                    //console.log("[2] trace.action.value : ", trace.action.value, totalGasUsed);
                                                }
                                            });
                                        } else if (trace.type === 'call') {
                                            //console.dir(trace);
                                            web3.eth.getCode(trace.action.to, function (err, code) {
                                                if (code !== "0x") {
                                                    trace.isContract = true;
                                                    var erc20Contract = web3.eth.contract(config.erc20ABI).at(trace.action.to);
                                                    if (data.source && data.source.abi) {
                                                        erc20Contract = web3.eth.contract(data.source.abi).at(trace.action.to);
                                                    }
                                                    var allevents = erc20Contract.allEvents({
                                                        fromBlock: trace.blockNumber,
                                                        toBlock: trace.blockNumber
                                                    });
                                                    allevents.get(function (err, events) {
                                                        if (err) {
                                                            console.log("Error receiving historical events:", err);
                                                        } else {
                                                            console.dir(events);
                                                            if (events[0].event === "Transfer" || events[0].event === "Approval") {
                                                                if (events[0].args && events[0].args._value) {
                                                                    trace.action.value = "0x".concat(events[0].args._value.toNumber().toString(16));
                                                                    trace.action.to = events[0].args._to;
                                                                }
                                                            }
                                                        }
                                                    });
                                                }
                                            });
                                        }

                                        /*
                                        const account_name = req.params.account.toLowerCase();
                                        var isPush = false;
                                        if (trace.type === 'reward' && trace.action.author && trace.action.author.toLowerCase() == account_name) {
                                            isPush = true;
                                        } else if (trace.type === 'call' && (trace.action.from.toLowerCase() == account_name || trace.action.to.toLowerCase() == account_name)) {
                                            isPush = true;
                                        }
                                        */
                                        //if (isPush) {
                                        if (!blocks[num]) {
                                            blocks[num] = [];
                                        }
                                        blocks[num].push(trace);

                                        data.previousBlockNumber = num - 1;
                                        data.fromBlock = num;
                                        //}
                                        if (Object.keys(blocks).length >= 100) {
                                            return incallback(null, null);
                                        }
                                        ineachCallback();
                                    }, function (err) {
                                        incallback(err, null);
                                    });
                                }
                            ],
                            function (err) {
                                if (Object.keys(blocks).length > 100) {
                                    return callback(err, null);
                                } else {
                                    return outeachCallback();
                                }
                            });
                    }, function (err) {
                        callback(err, null);
                    });
                }
            }
        ],
        function (err, contractevents) {
            if (err) {
                console.log("Error " + err);
            }

            data.address = req.params.account;
            data.officialurl = 'https://ethersocial.net/addr/' + data.address;

            data.blocks = [];
            for (var block in blocks) {
                data.blocks.push(blocks[block]);
            }

            if (data.source) {
                data.name = data.source.name;
            } else if (config.names[data.address]) {
                data.name = config.names[data.address];
            }

            data.blocks = data.blocks.reverse(); //.splice(0, 100);

            let setNodeText = new Set();
            let mapNodeText = new Map();

            for (var nodekey = 0; nodekey < data.blocks.length; nodekey++) {
                for (var idxtrace = 0; idxtrace < data.blocks[nodekey].length; idxtrace++) {
                    var tmpBlock = data.blocks[nodekey][idxtrace];
                    if (tmpBlock.type == "call") {
                        setNodeText.add(tmpBlock.action.from).add(tmpBlock.action.to);

                        let mapKey = tmpBlock.action.from.concat(",").concat(tmpBlock.action.to);
                        let mapValue = mapNodeText.get(mapKey);
                        if (mapValue != undefined) {
                            mapNodeText.set(mapKey, mapValue + parseInt(tmpBlock.action.value, 16) / 10e+17);
                        } else {
                            mapNodeText.set(mapKey, parseInt(tmpBlock.action.value, 16) / 10e+17);
                        }
                    } else if (tmpBlock.type == "reward") {
                        setNodeText.add("Mining").add(tmpBlock.action.author);

                        let mapKey = "Mining,".concat(tmpBlock.action.author);
                        let mapValue = mapNodeText.get(mapKey);
                        if (mapValue != undefined) {
                            mapNodeText.set(mapKey, mapValue + parseInt(tmpBlock.action.value, 16) / 10e+17);
                        } else {
                            mapNodeText.set(mapKey, parseInt(tmpBlock.action.value, 16) / 10e+17);
                        }
                    }
                }
            }

            data.nodeDataArray = [];
            data.linkDataArray = [];
            var nodeindex = 1;
            for (let nodetext of setNodeText) {
                data.nodeDataArray.push({
                    key: nodeindex,
                    text: nodetext
                });
                nodeindex++;
            }
            mapNodeText.forEach(function (value, key) {
                var nodelink1 = 0;
                var nodelink2 = 0;
                var arrkey = key.split(",");
                data.nodeDataArray.forEach(function (item, index, array) {
                    if (item.text == arrkey[0]) {
                        nodelink1 = item.key;
                    } else if (item.text == arrkey[1]) {
                        nodelink2 = item.key;
                    }
                });
                data.linkDataArray.push({
                    from: nodelink1,
                    to: nodelink2,
                    text: value.toFixed(3)
                });
            });

            if (contractEvents) {
                data.contractEvents = [];

                for (var contractnum in contractEvents) {
                    //console.dir(contractEvents[contractnum]);
                    data.contractEvents.push(contractEvents[contractnum][0]);
                }

                data.contractEvents = data.contractEvents.reverse(); //.splice(0, 100);
                //console.dir(data.contractEvents);
            }
            res.render('account', {
                account: data,
                nodedata: JSON.stringify(data.nodeDataArray),
                linkdata: JSON.stringify(data.linkDataArray)
            });
        });
});

module.exports = router;