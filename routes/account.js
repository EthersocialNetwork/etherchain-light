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
    var blocks = {};
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
                } else {
                    return callback(null, null);
                }
            },
            function (res, callback) {
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
                                var traces = totraces.concat(fromtraces);
                                traces.sort(function (a, b) {
                                    return (a.blockNumber < b.blockNumber) ? 1 : ((b.blockNumber < a.blockNumber) ? -1 : 0);
                                });
                                async.eachSeries(traces, function (trace, ineachCallback) {
                                    const num = trace.blockNumber;
                                    const account_name = req.params.account.toLowerCase();
                                    var isPush = false;
                                    if (trace.type === 'reward' && trace.action.author && trace.action.author.toLowerCase() == account_name) {
                                        isPush = true;
                                    } else if (trace.type === 'call' && (trace.action.from.toLowerCase() == account_name || trace.action.to.toLowerCase() == account_name)) {
                                        isPush = true;
                                    }

                                    if (isPush) {
                                        if (!blocks[num]) {
                                            blocks[num] = [];
                                        }
                                        blocks[num].push(trace);
                                        console.log(account_name.substr(0, 10), " trace.blockNumber: ", num);
                                        data.previousBlockNumber = num - 1;
                                        data.fromBlock = num;
                                    }
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
        ],
        function (err) {
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
                    text: value.toFixed(3) + " ESN"
                });
            });

            res.render('account', {
                account: data,
                nodedata: JSON.stringify(data.nodeDataArray),
                linkdata: JSON.stringify(data.linkDataArray)
            });
        });
});

module.exports = router;