# Etherchain Light
### Lightweight blockchain explorer for your private Ethereum chain

Etherchain Light is an Ethereum blockchain explorer built with NodeJS, Express and Parity. It does not require an external database and retrieves all information on the fly from a backend Ethereum node.

While there are several excellent Ethereum blockchain explorers available (etherscan, ether.camp and etherchain) they operate on a fixed subset of Ethereum networks, usually the mainnet and testnet. Currently there are no network agnostic blockchain explorers available. If you want to develop Dapps on a private testnet or would like to launch a private / consortium network, Etherchain Light will allow you to quickly explore such chains.

A demo instance connected to the EtherSocialNetwork is available at [http://explorer.sejun.info](http://http://explorer.sejun.info).

## Current Features
* Browse blocks, transactions, accounts and contracts
* View pending transactions
* Display contract internal calls (call, create, suicide)
* Upload & verify contract sources
* Show Solidity function calls & parameters (for contracts with available source code)
* Display the current state of verified contracts
* Named accounts
* Advanced transaction tracing (VM Traces & State Diff)
* View failed transactions
* Live Backend Node status display
* Submit signed Transactions to the Network
* Support for all [Bootswatch](https://bootswatch.com/) skins
* Accounts enumeration
* Signature verification
* Supports IPC and HTTP backend connections
* Responsive layout
* ERC20 Token support

## Planned features
* API service

Missing a feature? Please request it by creating a new [Issue](https://github.com/gobitfly/etherchain-light/issues).

## Usage notes
This blockchain explorer is intended for private Ethereum chains. As it does not have a dedicated database all data will be retrived on demand from a backend Parity node. Some of those calls are ressource intensive (e.g. retrieval of the full tx list of an account) and do not scale well for acounts with a huge number of transactions. We currently develop the explorer using the Kovan testnet but it will work with every Parity compatible Ethereum network configuration. The explorer is still under heavy development, if you find any problems please create an issue or prepare a pull request.

## Getting started

### Setup from source

Supported OS: Ubuntu 16.04

Supported Ethereum backend nodes: Parity (Geth is currently not supported as it does not allow account and received/sent tx enumeration)

1. Setup a nodejs & npm environment
2. Install the latest version of the Parity Ethereum client
3. Start parity using the following options: `./parity --datadir ../../chaindata/ --chain ethersocial --port 50505 --mode active --ipc-path ~/.Ethersocial/gesc.ipc --fat-db=on --pruning=archive --author 0x5811590907050746b897eFE65FeA7B65710E1a2c --max-peers 15`
4. Clone this repository to your local machine: `git clone https://github.com/EthersocialNetwork/etherchain-light --recursive` (Make sure to include `--recursive` in order to fetch the solc-bin git submodule)
5. Install all dependencies: `npm install`
6. Rename `config.js.example` into `config.js` and adjust the file to your local environment
7. Start the explorer: `npm start`
8. Browse to `http://localhost:3000`
9. How to use "Forever": `forever start ./bin/www`

```crontab
7 */2 * * *             curl 'http://explorer.sejun.info/hashratechart'
3,15,27,39,51 * * * *   curl 'http://explorer.sejun.info/redisblock'
*/2 * * * *             curl 'http://explorer.sejun.info/top100_settingup'
5,25,45 * * * *         curl 'http://explorer.sejun.info/peers'
```