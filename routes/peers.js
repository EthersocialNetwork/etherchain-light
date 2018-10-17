const express = require('express');
const router = express.Router();

const async = require('async');
const Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const geoip = require('geoip-lite');
const iso = require('iso-3166-1');
const tcpPortUsed = require('tcp-port-used');

const pre_fix = 'explorerPeers:';

router.get('/:json?', function (req, res, next) {
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	//console.log("\nclient ip: "+ip+"\n");

	var config = req.app.get('config');
	var web3 = new Web3();
    web3.setProvider(config.selectParity());
	var data = {};
	data.peers = [];

	client.on("error", function (err) {
		console.log("Error " + err);
	});

	async.waterfall([
		function (callback) {
			if (ip == config.cronIP) {
				console.log("--------- Peers Settingup Start: ", printDateTime(new Date()), "--------- ");
				web3.parity.netPeers(function (err, result) {
					//console.log("result.connected: " + result.connected);
					callback(err, result.peers);
				});
			} else {
				callback(null, null);
			}
		},
		function (peers, callback) {
			if (!peers) {
				callback(null);
			} else {
				peers.slice(0).forEach(function (element) {
					if (element.network.remoteAddress == 'Handshake') {
						peers.splice(peers.indexOf(element), 1);
					}
				});
				peers.forEach(element => {
					var rres = element.network.remoteAddress.split(":");
					element.ip = rres[0];
					if (rres.length > 1) {
						element.port = rres[1];
					} else {
						element.port = "undefined";
					}
				});
				peers = peers.sort((a, b) => {
					if (!b.port) {
						return -1;
					}
					if (!a.port) {
						return 1;
					}

					if (parseInt(a.port, 10) == 50505) {
						return -1;
					}
					if (parseInt(b.port, 10) == 50505) {
						return 1;
					}

					if (parseInt(a.port, 10) < parseInt(b.port, 10)) {
						return 1;
					}
					if (parseInt(a.port, 10) > parseInt(b.port, 10)) {
						return -1;
					}
					return 0;
				});

				var existAddress = [];
				async.eachSeries(peers, function (peer, eachCallback) {
					if (peer.ip == '115.68.110.213') {
						//console.log("peer(115.68.110.213):", peer);
						eachCallback();
					} else {
						const time_now = new Date();
						const scan_time = printDateTime(time_now);
						const scan_msTime = time_now.getTime();
						var tmp_data = {};
						//id, name, remoteAddress
						//console.log("peer: " + peer.id, peer.name, peer.remoteAddress, peer.scantime);
						tmp_data.ip = peer.ip;
						tmp_data.port = peer.port;
						tmp_data.id = peer.id;
						tmp_data.name = peer.name; //Gesn/v0.3.2-unstable-8f84614d/linux-amd64/go1.9.4 //exe, ver, os, gover
						if (!peer.name || peer.name.length < 1) {
							eachCallback();
						} else if (!peer.protocols.eth || !peer.protocols.eth.head || peer.protocols.eth.head.length < 1) {
							eachCallback();
						} else {
							if (peer.name.length > 2) {
								var sres = peer.name.split("/");
								if (sres.length > 4)
									sres.splice(1, 1);
								tmp_data.exe = sres[0];
								if (sres.length > 1) {
									var sres_ver = sres[1].split("-");
									if (sres_ver.length > 1)
										tmp_data.ver = sres_ver[0] + "-" + sres_ver[1];
									else
										tmp_data.ver = sres_ver[0];
								}
								if (sres.length > 2)
									tmp_data.os = sres[2];
								if (sres.length > 3)
									tmp_data.gover = sres[3];
							}

							if (tmp_data.ip && tmp_data.ip.split(".").length > 2 && tmp_data.id && tmp_data.id.length > 10) {
								var s = tmp_data.id;
								var h = 0,
									l = s.length,
									i = 0;
								if (l > 0) {
									while (i < l) {
										h = (h << 5) - h + s.charCodeAt(i++) | 0;
									}
								}

								var txt_geo;
								var geo = geoip.lookup(tmp_data.ip); //node ./node_modules/geoip-lite/scripts/updatedb.js
								if (!geo) {
									//console.log("if (!geo) { : ", tmp_data);
									txt_geo = "local area network".concat(", ", "LAN");
									return eachCallback();
								} else {
									if (!geo.city || geo.city.length < 2) {
										geo.city = "unknown";
									}
									txt_geo = String(geo.city).concat(", ", geo.country);
								}

								if (tmp_data.port == config.networkPortString || existAddress.includes(tmp_data.ip)) {
									var enode = "enode://";
									enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);

									var rds_value = {
										id: tmp_data.id,
										exe: tmp_data.exe,
										ver: tmp_data.ver,
										os: tmp_data.os,
										gover: tmp_data.gover,
										ip: tmp_data.ip,
										port: tmp_data.port,
										scantime: scan_time,
										enode: enode,
										name: tmp_data.name,
										scanmstime: scan_msTime,
										geo: txt_geo
									};
									var rds_key = pre_fix.concat(h);
									client.hmset(rds_key, rds_value);
									var rds_key2 = pre_fix.concat("list");
									client.hset(rds_key2, h, tmp_data.id);
									if (!existAddress.includes(tmp_data.ip)) {
										existAddress.push(tmp_data.ip);
									}
									eachCallback();
								} else {
									var inUse = true; // wait until the port is in use
									tcpPortUsed.waitForStatus(config.networkPortNumber, tmp_data.ip, inUse, 200, 400)
										.then(function () {
											//console.log("tcpPortUsed.waitForStatus:", config.networkPortString, tmp_data.ip, "\n", inUse);
											tmp_data.orgPort = tmp_data.port;
											tmp_data.port = config.networkPortString;
											var enode = "enode://";
											enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);
											var rds_value = {
												id: tmp_data.id,
												exe: tmp_data.exe,
												ver: tmp_data.ver,
												os: tmp_data.os,
												gover: tmp_data.gover,
												ip: tmp_data.ip,
												port: tmp_data.port,
												orgPort: tmp_data.orgPort,
												scantime: scan_time,
												enode: enode,
												name: tmp_data.name,
												scanmstime: scan_msTime,
												geo: txt_geo
											};
											var rds_key = pre_fix.concat(h);
											client.hmset(rds_key, rds_value);
											var rds_key2 = pre_fix.concat("list");
											client.hset(rds_key2, h, tmp_data.id);
											if (!existAddress.includes(tmp_data.ip)) {
												existAddress.push(tmp_data.ip);
											}
											eachCallback();
										}, function (err) {
											if (err) {
												//console.log("tcpPortUsed.waitForStatus Error:", config.networkPortString, tmp_data.ip, "\n", err);
												var enode = "enode://";
												enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);
												var rds_value = {
													id: tmp_data.id,
													exe: tmp_data.exe,
													ver: tmp_data.ver,
													os: tmp_data.os,
													gover: tmp_data.gover,
													ip: tmp_data.ip,
													port: tmp_data.port,
													scantime: scan_time,
													enode: enode,
													name: tmp_data.name,
													scanmstime: scan_msTime,
													geo: txt_geo
												};
												var rds_key = pre_fix.concat(h);
												client.hmset(rds_key, rds_value);
												var rds_key2 = pre_fix.concat("list");
												client.hset(rds_key2, h, tmp_data.id);
												if (!existAddress.includes(tmp_data.ip)) {
													existAddress.push(tmp_data.ip);
												}
											}
											eachCallback();
										});
								}
							} else {
								eachCallback();
							}
						}
					}
				}, function (err) {
					callback(err);
				});
			}
		},
		function (callback) {
			if (ip != config.cronIP) {
				var rds_key = pre_fix.concat("list");
				client.hgetall(rds_key, function (err, replies) {
					var pre_fields = [];
					for (var hkey in replies) {
						pre_fields.push(hkey);
					}
					callback(err, pre_fields);
				});
			} else {
				sleep(2000).then(() => {
					var rds_key = pre_fix.concat("list");
					client.hgetall(rds_key, function (err, replies) {
						var pre_fields = [];
						for (var hkey in replies) {
							pre_fields.push(hkey);
						}
						console.log("--------- Peers Settingup End: ", printDateTime(new Date()), "--------- ");
						callback(err, pre_fields);
					});
				});
			}
		},
		function (pre_fields, callback) {
			async.eachSeries(pre_fields, function (field, eachCallback) {
				client.hgetall(pre_fix.concat(field), function (err, peer_info) {
					if (err) {
						eachCallback(err);
					} else {
						if (!peer_info) {
							console.log("no peer_info: " + pre_fix.concat(field));
						} else if (peer_info.scanmstime > (new Date()).getTime() - 60 * 60 * 24 * 7 * 1000) {
							var sIP = peer_info.ip.split(".");
							sIP[1] = "***";
							peer_info.ip = sIP.join(".");
							data.peers.push(peer_info);
						}
						eachCallback();
					}
				});
			}, function (err) {
				callback(data.peers, err);
			});
		}
	], function (peers, err) {
		//client.quit();
		if (err) {
			console.log("Error " + err);
		}

		if (req.params.json || req.params.json !== undefined) {
			peers = peers.sort((a, b) => {
				if (!b.port) {
					return -1;
				}
				if (!a.port) {
					return 1;
				}

				if (parseInt(a.port, 10) == 50505) {
					return -1;
				}
				if (parseInt(b.port, 10) == 50505) {
					return 1;
				}

				if (parseInt(a.port, 10) < parseInt(b.port, 10)) {
					return 1;
				}
				if (parseInt(a.port, 10) > parseInt(b.port, 10)) {
					return -1;
				}
				return 0;
			});

			var stringJson;
			if (req.params.json == "gesn") {
				stringJson = "[\n";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat('"', element.enode, '",', '\n');
					}
				});
				stringJson = stringJson.slice(0, -1); //'\n'
				stringJson = stringJson.slice(0, -1); //','
				stringJson = stringJson.concat('\n]');
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else if (req.params.json == "addpeer") {
				stringJson = "";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat('admin.addPeer("', element.enode, '")\n');
					}
				});
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else if (req.params.json == "parity") {
				stringJson = "";
				peers.forEach(element => {
					//console.dir(element.enode);
					if (element.enode) {
						stringJson = stringJson.concat(element.enode, '\n');
					}
				});
				res.type('text/plain; charset=utf-8');
				res.set('Content-Type', 'text/plain');
				res.send(new Buffer(stringJson));
			} else {
				res.json(resultToJson(null, peers));
			}
		} else {
			data.peers = data.peers.sort((a, b) => {
				if (!b.scanmstime) {
					return -1;
				}
				if (!a.scanmstime) {
					return 1;
				}
				if (a.scanmstime < b.scanmstime) {
					return 1;
				}
				if (a.scanmstime > b.scanmstime) {
					return -1;
				}
				return 0;
			});
			var arrExe = [];
			var arrVer = [];
			var arrOs = [];
			var arrGover = [];
			var arrGeo = [];
			for (var h in data.peers) {
				if (typeof data.peers[h].exe === 'undefined' || typeof data.peers[h].ver === 'undefined' || typeof data.peers[h].os === 'undefined' || typeof data.peers[h].gover === 'undefined' || typeof data.peers[h].geo === 'undefined') {
					continue;
				}
				arrExe.push(data.peers[h].exe);
				arrVer.push(data.peers[h].ver);
				arrOs.push(data.peers[h].os);
				arrGover.push(data.peers[h].gover);
				arrGeo.push(data.peers[h].geo);
			}

			data.commands = makeReturnSeries(arrExe);
			data.versions = makeReturnSeries(arrVer);
			data.oss = makeReturnSeries(arrOs);
			data.goversions = makeReturnSeries(arrGover);
			data.geo = makeReturnSeries(arrGeo);
			data.geoCategories = makeGeoCategories(arrGeo);
			if (ip == config.cronIP) {
				res.json(resultToJson(null, data.peers));
			} else {
				res.render('peers', {
					peers: data.peers,
					commands: data.commands,
					versions: data.versions,
					oss: data.oss,
					goversions: data.goversions,
					geo: data.geo,
					geoCategories: data.geoCategories,
					jsload_defer: config.jsload_defer,
					jsload_async: config.jsload_async
				});
			}
		}
	});
});

module.exports = router;

function resultToJson(err, param) {
	var result = {};
	result.jsonrpc = 'esn';
	result.success = false;

	if (err) {
		result.result = err;
	} else if (param) {
		result.result = param;
		result.success = true;
	} else {
		result.result = NaN;
	}
	return result;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function addZeros(num, digit) {
	var zero = '';
	num = num.toString();
	if (num.length < digit) {
		for (i = 0; i < digit - num.length; i++) {
			zero += '0';
		}
	}
	return zero + num.toString();
}

function printDateTime(currentDate) {
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}

function makeReturnSeries(arr) {
	prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});
	resArray = [];
	for (var kcmd in prcArray) {
		resArray.push({
			name: kcmd,
			y: prcArray[kcmd]
		});
	}
	return JSON.stringify(resArray);
}

function makeGeoCategories(arr) {
	var prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});

	var colors = ['#f28f43', '#0d233a', '#8bbc21', '#910000', '#1aadce',
		'#492970', '#2f7ed8', '#77a1e5', '#c42525', '#a6c96a'
	];
	var result = {};
	result.categories = [];
	result.data = [];

	var idx = 0;
	for (var kcmd in prcArray) {
		if (idx > (colors.length - 1)) {
			return JSON.stringify(result);
		}

		var spArray = kcmd.split(", ");
		var country = null;
		if (iso.whereAlpha2(spArray[1])) {
			country = iso.whereAlpha2(spArray[1]).country;
		}
		if (!country) {
			country = spArray[1];
		}

		var subCategories = {};
		if (!(result.categories.includes(country))) {
			result.categories.push(country);
			subCategories.y = prcArray[kcmd];
			subCategories.color = colors[idx];
			subCategories.drilldown = {};
			subCategories.drilldown.name = country;
			subCategories.drilldown.categories = [];
			subCategories.drilldown.categories.push(spArray[0] + ", " + country);
			subCategories.drilldown.data = [];
			subCategories.drilldown.data.push(prcArray[kcmd]);
			result.data.push(subCategories);
			idx++;
		} else {
			for (var rLeni = 0; rLeni < result.data.length; rLeni++) {
				if (result.data[rLeni].drilldown.name == country) {
					result.data[rLeni].y += prcArray[kcmd];
					result.data[rLeni].drilldown.categories.push(spArray[0] + ", " + country);
					result.data[rLeni].drilldown.data.push(prcArray[kcmd]);
				}
			}
		}
	}
	return JSON.stringify(result);
}