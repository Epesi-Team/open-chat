(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.unstoppableChat = factory());
}(this, (function () { 'use strict';

  const Gun = require('gun');
  const Sea = require('gun/sea');

  Gun.SEA = Sea;
  class GunChat {
    constructor(superpeers) {
      this.gun = new Gun(superpeers);
      this.publicName = null;
    }

    async join(username, password, publicName, cb) {
      if (!username || !password || !cb) return;
      const gun = this.gun;
      gun.on('auth', () => {
        gun.user().get('name').put(publicName);
        this.publicName = publicName;
        cb();
      });
      gun.user().recall({ sessionStorage: true });
      gun.user().create(username, password, (ack) => {
        if (ack && ack.err) {
          gun.user().auth(username, password);
        }
      });
    }

    async reset() {
      const gun = this.gun;
      gun.user().get('pchat')
        .put(null, () => {
          gun.user().get('pchat')
            .put({ null: null });
        });
      gun.user().get('contacts')
        .put(null, () => {
          gun.user().get('contacts')
            .put({ null: null });
        });
      gun.user().get('pchannel')
        .put(null, () => {
          gun.user().get('pchannel')
            .put({ null: null });
        });
      gun.get(gun.user()._.sea.pub).get('invites').get('pcontact')
        .put(null, () => {
          gun.get(gun.user()._.sea.pub).get('invites').get('pcontact')
            .put({ null: null });
        });
      gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
        .put(null, () => {
          gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
            .put({ null: null });
        });
    }

    async logout() {
      const gun = this.gun;
      gun.user().leave();
    }

    async addContact(username, publicName) {
      if (!username) return;
      const gun = this.gun;
      const peerByUsername = await gun.get(`~@${username}`).once();
      if (!peerByUsername) return;
      const pubKey = Object.keys(peerByUsername)[1].substr(1);
      gun.user().get('contacts').get(pubKey).put({
        pubKey,
        alias: username,
        name: publicName
      });
      gun.get(pubKey).get('invites').get('contacts').get(gun.user().is.pub)
        .put({
          pubKey: gun.user().is.pub,
          alias: gun.user().is.alias,
          name: this.publicName
        });
    }

    async removeContact(pubKey) {
      if (!pubKey) return;
      const gun = this.gun;
      gun.user().get('contacts').get(pubKey).put(null, () => {
        gun.user().get('contacts').get(pubKey).put({ null: null });
      });
    }

    async loadContacts(cb) {
      if (!cb) return;
      const gun = this.gun;
      const loadedContacts = {};
      const contactsList = [];
      gun.user().get('contacts').on((contacts) => {
        if (!contacts) return;
        Object.keys(contacts).forEach((pubKey) => {
          if (pubKey === '_' || pubKey === 'null' || loadedContacts[pubKey]) return;
          gun.user().get('contacts').get(pubKey).on((contact) => {
            if (!contact || !contact.name || loadedContacts[pubKey]) return;
            loadedContacts[pubKey] = true;
            const contactIndex = contactsList.length;
            contactsList.push({
              pubKey: contact.pubKey,
              alias: contact.alias,
              name: contact.name
            });
            cb(contactsList);
            gun.get('pchat').get(gun.user().is.pub).get(contact.pubKey).get('new')
              .on((newMsgs) => {
                let newCount = 0;
                Object.keys(newMsgs).forEach((time) => {
                  if (time === '_' || !newMsgs[time]) return;
                  newCount += 1;
                });
                contactsList[contactIndex].notifCount = newCount;
                cb(contactsList);
              });
          });
        });
      });
    }

    async loadContactInvites(cb) {
      if (!cb) return;
      const gun = this.gun;
      const invitesList = [];
      const loadedInvites = {};
      gun.get(gun.user()._.sea.pub).get('invites').get('contacts')
        .on(async (contacts) => {
          Object.keys(contacts).forEach((pubKey) => {
            if (pubKey === '_' || pubKey === 'null' || loadedInvites[pubKey]) return;
            gun.get(gun.user()._.sea.pub).get('invites').get('contacts').get(pubKey)
              .once((contact) => {
                if (!contact || !contact.name || loadedInvites[contact.pubKey]) return;
                gun.user().get('contacts').get(pubKey)
                  .once(async (savedContact) => {
                    if (savedContact && savedContact.name) return;
                    loadedInvites[contact.pubKey] = true;
                    invitesList.push({
                      name: contact.name,
                      pubKey: contact.pubKey,
                      alias: contact.alias
                    });
                    cb(invitesList);
                  });
              });
          });
        });
    }

    async acceptContactInvite(username, publicName) {
      if (!username && !publicName) return;
      const gun = this.gun;
      const peerByUsername = await gun.get(`~@${username}`).once();
      if (!peerByUsername) return;
      const pubKey = Object.keys(peerByUsername)[1].substr(1);
      gun.user().get('contacts').get(pubKey)
        .put({
          pubKey,
          alias: username,
          name: publicName
        });
      gun.get(gun.user()._.sea.pub).get('invites').get('contacts').get(pubKey)
        .put(null, () => {
          gun.get(gun.user()._.sea.pub).get('invites').get('contacts').get(pubKey)
            .put({ null: null });
        });
    }

    async denyContactInvite(pubKey) {
      if (!pubKey) return;
      const gun = this.gun;
      gun.get(gun.user()._.sea.pub).get('invites').get('contacts').get(pubKey)
        .put(null, () => {
          gun.get(gun.user()._.sea.pub).get('invites').get('contacts').get(pubKey)
            .put({ null: null });
        });
    }

    async sendMessageToContact(pubKey, msg) {
      if (!pubKey) return;
      const gun = this.gun;
      if (msg.length < 1) return;
      const time = Date.now();
      const otherPeer = gun.user(pubKey);
      const otherPeerKeys = await otherPeer.then();
      const otherPeerEpub = otherPeerKeys.epub;
      const sec = await Gun.SEA.secret(otherPeerEpub, gun.user()._.sea);
      const encMsg = await Gun.SEA.encrypt(msg, sec);
      gun.user().get('pchat').get(pubKey).get(time)
        .put(JSON.stringify({
          msg: encMsg,
          time
        }));
      gun.get('pchat').get(pubKey).get(gun.user().is.pub).get('new')
        .get(time)
        .put(JSON.stringify({
          msg: encMsg,
          time
        }));
      gun.get('pchat').get(pubKey).get(gun.user().is.pub).get('latest')
        .put(JSON.stringify({
          msg: JSON.stringify(encMsg),
          time
        }));
      gun.get('pchat').get(gun.user().is.pub).get(pubKey).get('latest')
        .put(JSON.stringify({
          msg: JSON.stringify(encMsg),
          time
        }));
    }

    async loadMessagesOfContact(pubKey, publicName, cb) {
      if (!pubKey || !cb) return;
      const gun = this.gun;
      const loadedMsgs = {};
      const loadedMsgsList = [];
      const otherPeer = gun.user(pubKey);
      const otherPeerKeys = await otherPeer.then();
      const otherPeerEpub = otherPeerKeys.epub;
      async function loadMsgsOf(path, name) {
        path.on((msgs) => {
          if (!msgs) return;
          Object.keys(msgs).forEach((time) => {
            if (loadedMsgs[time]) return;
            path.get(time)
              .on(async (msgDataString) => {
                loadedMsgs[time] = true;
                if (!msgDataString) return;
                let msgData = msgDataString;
                if (typeof msgDataString === 'string') {
                  msgData = JSON.parse(msgDataString);
                }
                if (!msgData || !msgData.msg) return;
                if (typeof msgData.msg === 'string') {
                  msgData.msg = JSON.parse(msgData.msg.substr(3, msgData.msg.length));
                }
                const sec = await Gun.SEA.secret(otherPeerEpub, gun.user()._.sea);
                const decMsg = await Gun.SEA.decrypt(msgData.msg, sec);
                if (!decMsg) return;
                loadedMsgsList.push({
                  time: msgData.time,
                  msg: decMsg,
                  owner: name
                });
                loadedMsgsList.sort((a, b) => a.time - b.time);
                cb(loadedMsgsList);
                gun.get('pchat').get(gun.user().is.pub).get(pubKey).get('new')
                  .put(null, () => {
                    gun.get('pchat').get(gun.user().is.pub).get(pubKey).get('new')
                      .put({ null: null });
                  });
              });
          });
        });
      }
      loadMsgsOf(gun.user().get('pchat')
        .get(pubKey));
      loadMsgsOf(gun.user(pubKey).get('pchat').get(gun.user()._.sea.pub));
    }

    async createChannel(channelName) {
      const gun = this.gun;
      const channelPair = await Gun.SEA.pair();
      const channelKey = channelPair.epub;
      const sec = await Gun.SEA.secret(channelKey, gun.user()._.sea);
      const encPair = await Gun.SEA.encrypt(JSON.stringify(channelPair), sec);
      gun.user().get('pchannel').get(channelKey).get('pair')
        .put(encPair);
      gun.user().get('pchannel').get(channelKey).get('name')
        .put(channelName);
      gun.user().get('pchannel').get(channelKey).get('peers')
        .get(gun.user().is.pub)
        .put(JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true
        }));
    }

    async leaveChannel(channel) {
      if (!channel) return;
      const gun = this.gun;
      const leaveMsg = `${this.publicName} has left the chat.`;
      this.sendMessageToChannel(channel, leaveMsg, {
        pubKey: gun.user().is.pub,
        alias: gun.user().is.alias,
        name: this.publicName,
        action: 'leave'
      });
      gun.user().get('pchannel').get(channel.key)
        .put(null, () => {
          gun.user().get('pchannel').get(channel.key)
            .put({ null: null });
        });
    }

    async loadChannels(cb) {
      if (!cb) return;
      const gun = this.gun;
      const loadedChannels = {};
      const loadedChannelsList = [];
      gun.user().get('pchannel')
        .on(async (channels) => {
          if (!channels) return;
          Object.keys(channels).forEach(async (channelKey) => {
            if (loadedChannels[channelKey]) return;
            const sec = await Gun.SEA.secret(channelKey, gun.user()._.sea);
            gun.user().get('pchannel').get(channelKey).get('name')
              .once((channelName) => {
                if (!channelName || loadedChannels[channelKey]) return;
                gun.user().get('pchannel').get(channelKey).get('pair')
                  .once(async (ePair) => {
                    if (!ePair || typeof ePair === 'string' || loadedChannels[channelKey]) return;
                    loadedChannels[channelKey] = true;
                    const pair = await Gun.SEA.decrypt(ePair, sec);
                    const loadedChannelIndex = loadedChannelsList.length;
                    loadedChannelsList.push({
                      key: channelKey,
                      name: channelName,
                      userCount: 0,
                      latestMsg: null,
                      pair,
                    });
                    cb(loadedChannelsList);
                    gun.get('pchannel').get(channelKey).get('peers').get(gun.user().is.pub)
                      .get('new')
                      .on((newMsgs) => {
                        if (!newMsgs) return;
                        let newCount = 0;
                        Object.keys(newMsgs).forEach((time) => {
                          if (time === '_' || !newMsgs[time]) {
                            return;
                          }
                          newCount += 1;
                        });
                        loadedChannelsList[loadedChannelIndex].notifCount = newCount;
                        cb(loadedChannelsList);
                      });
                  });
              });
          });
        });
    }

    async inviteToChannel(channelKey, username, publicName) {
      if (!channelKey || !username || !publicName) return;
      const gun = this.gun;
      const peerByAliasData = await gun.get(`~@ ${username}`).once();
      if (!peerByAliasData) return;
      gun.user().get('pchannel').get(channelKey).get('pair')
        .once((ePair) => {
          if (!ePair) return;
          gun.user().get('pchannel').get(channelKey).get('peers')
            .once((peers) => {
              if (!peers) return;
              gun.user().get('pchannel').get(channelKey).get('name')
                .once(async (name) => {
                  if (!name) return;
                  const channelSec = await Gun.SEA.secret(channelKey, gun.user()._.sea);
                  const channelPair = await Gun.SEA.decrypt(ePair, channelSec);
                  const peerPubKey = Object.keys(peerByAliasData)[1].substr(1);
                  const otherPeerKeys = await gun.user(peerPubKey).then();
                  const otherPeerEpub = otherPeerKeys.epub;
                  const inviteSec = await Gun.SEA.secret(otherPeerEpub, gun.user()._.sea);
                  const eInvitePair = await Gun.SEA.encrypt(
                    JSON.stringify(channelPair),
                    inviteSec,
                  );
                  const channelInvite = {
                    name,
                    key: channelKey,
                    peers,
                    pair: eInvitePair
                  };
                  gun.get(peerPubKey).get('invites').get('pchannel').get(gun.user()._.sea.pub)
                    .get(channelKey)
                    .put(JSON.stringify(channelInvite));
                  this.sendMessageToChannel(channelInvite, `${publicName} has been invited.`, {
                    pubKey: peerPubKey,
                    alias: username,
                    name: publicName,
                    action: 'invited'
                  });
                  gun.user().get('pchannel').get(channelInvite.key).get('peers')
                    .get(peerPubKey)
                    .put(JSON.stringify({
                      alias: username,
                      name: publicName,
                      joined: false,
                    }));
                });
            });
        });
    }

    async loadChannelInvites(cb) {
      if (!cb) return;
      const gun = this.gun;
      const loadedInvites = {};
      const loadedInvitesList = [];
      gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
        .on(async (peerInvites) => {
          if (!peerInvites) return;
          Object.keys(peerInvites).forEach((peerPub) => {
            if (peerPub === '_') return;
            gun.get(gun.user()._.sea.pub).get('invites').get('pchannel').get(peerPub)
              .on(async (channels) => {
                if (!channels) return;
                Object.keys(channels).forEach(async (channelKey) => {
                  const channel = typeof channels[channelKey] === 'string' ? JSON.parse(channels[channelKey]) : channels[channelKey];
                  if (channelKey === '_' || !channel.name || loadedInvites[channelKey]) return;
                  loadedInvites[channelKey] = channelKey;
                  const peerKeys = await gun.user(peerPub).then();
                  const peerEpub = peerKeys ? peerKeys.epub : null;
                  const sec = await Gun.SEA.secret(peerEpub, gun.user()._.sea);
                  if (typeof channel.pair === 'string') {
                    channel.pair = JSON.parse(channel.pair.substr(3, channel.pair.length));
                  }
                  channel.pair = await Gun.SEA.decrypt(channel.pair, sec);
                  channel.peerPub = peerPub;
                  channel.peerAlias = peerKeys.alias;
                  channel.key = channelKey;
                  loadedInvitesList.push(channel);
                  cb(loadedInvitesList);
                });
              });
          });
        });
    }

    async acceptChannelInvite(invite) {
      if (!invite) return;
      const gun = this.gun;
      gun.user().get('pchannel').get(invite.key).get('name')
        .put(invite.name);
      gun.user().get('pchannel').get(invite.key).get('peers')
        .get(gun.user().is.pub)
        .put(JSON.stringify({
          alias: gun.user().is.alias,
          name: this.publicName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub
        }));
      gun.user().get('pchannel').get(invite.key)
        .get('peers')
        .get(invite.peerPub)
        .put(JSON.stringify({
          alias: invite.peerAlias,
          name: invite.peerName,
          joined: true,
          key: invite.key,
          peerPub: invite.peerPub
        }));
      const sec = await Gun.SEA.secret(invite.key, gun.user()._.sea);
      const encPair = await Gun.SEA.encrypt(invite.pair, sec);
      gun.user().get('pchannel').get(invite.key).get('pair')
        .put(encPair);
      const loadedPeers = {};
      Object.keys(invite.peers).forEach((pubKey) => {
        if (pubKey === '_') return;
        gun.user(invite.peerPub).get('pchannel').get(invite.key)
          .get('peers')
          .get(pubKey)
          .once((peer) => {
            if (loadedPeers[pubKey] || !peer) return;
            loadedPeers[pubKey] = pubKey;
            gun.user().get('pchannel').get(invite.key)
              .get('peers')
              .get(pubKey)
              .put(JSON.stringify(peer));
          });
      });
      gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
        .get(invite.peerPub)
        .get(invite.key)
        .put(null, () => {
          gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
            .get(invite.peerPub)
            .get(invite.key)
            .put({ null: null });
        });
      const channel = invite;
      if (!channel.peers[gun.user().is.pub]) {
        channel.peers[gun.user().is.pub] = { alias: gun.user().is.alias };
      }
      channel.peers[gun.user().is.pub].joined = true;
      const joinMsg = `${this.publicName} has joined the chat!`;
      this.sendMessageToChannel(channel, joinMsg, {
        pubKey: gun.user().is.pub,
        alias: gun.user().is.alias,
        name: this.publicName,
        action: 'join'
      });
    }

    async denyChannelInvite(invite) {
      if (!invite) return;
      const gun = this.gun;
      gun.get(gun.user()._.sea.pub).get('invites').get('pchannel')
        .get(invite.peerPub)
        .get(invite.key)
        .put(null);
    }

    async sendMessageToChannel(channel, msg, peerInfo) {
      if (!channel || msg.length === 0) return;
      const gun = this.gun;
      const time = Date.now();
      const sec = await Gun.SEA.secret(channel.key, channel.pair);
      const encMsg = await Gun.SEA.encrypt(msg, sec);
      const channelChatToSend = gun.user().get('pchannel').get(channel.key)
        .get('chat');
      let peerInfoData;
      if (peerInfo) peerInfoData = JSON.stringify(peerInfo);
      channelChatToSend.get(time)
        .put(JSON.stringify({
          msg: encMsg,
          userPub: gun.user().is.pub,
          userName: this.publicName,
          time,
          peerInfoData,
        }));
      gun.get('pchannel').get(channel.key).get('latest')
        .put({
          msg: encMsg,
          user: gun.user().is.pub,
          time,
          peerInfoData,
        });
      if (!channel.peers) return;
      Object.keys(channel.peers).forEach((pubKey) => {
        if (pubKey !== '_' && channel.peers[pubKey] && pubKey !== gun.user().is.pub) {
          gun.get('pchannel').get(channel.key).get('peers').get(pubKey)
            .get('new')
            .get(time)
            .put({
              msg: encMsg,
              user: gun.user().is.pub,
              time
            });
        }
      });
    }

    async loadMessagesOfChannel(channel, cb) {
      if (!channel || !cb) return;
      const gun = this.gun;
      const channelKey = channel.key;
      const loadedMsgsList = [];
      const loadedMsgs = {};
      const channelSec = await Gun.SEA.secret(channel.key, channel.pair);
      async function loadMsgsOf(path, name) {
        path.on((peerMsgs) => {
          if (!peerMsgs) return;
          Object.keys(peerMsgs).forEach((time) => {
            if (loadedMsgs[time] || time === '_') return;
            path.get(time)
              .on(async (msgDataString) => {
                let msgData = msgDataString;
                if (typeof msgDataString === 'string') {
                  msgData = JSON.parse(msgDataString);
                }
                if (typeof msgData.msg === 'string') {
                  msgData.msg = JSON.parse(msgData.msg.substr(3, msgData.msg.length));
                }
                loadedMsgs[time] = msgData;
                const decMsg = await Gun.SEA.decrypt(msgData.msg, channelSec);
                if (!msgData || !msgData.msg || !decMsg || !msgData.userPub) return;
                if (msgData.peerInfo) {
                  if (typeof msgData.peerInfo === 'string') {
                    msgData.peerInfo = JSON.parse(msgData.peerInfo);
                  }
                  if (msgData.peerInfo.action === 'join') {
                    gun.user().get('pchannel').get(channelKey).get('peers')
                      .get(msgData.peerInfo.pubKey)
                      .put({
                        alias: msgData.peerInfo.alias,
                        pubKey: msgData.peerInfo.pubKey,
                        name: msgData.peerInfo.name,
                        joined: true,
                      });
                  } else if (msgData.peerInfo.action === 'leave') {
                    gun.user().get('pchannel').get(channel.key).get('peers')
                      .get(msgData.peerInfo.pubKey)
                      .put(null);
                  } else if (msgData.peerInfo.action === 'invited') {
                    gun.user().get('pchannel').get(channelKey).get('peers')
                      .get(msgData.peerInfo.pubKey)
                      .put({
                        alias: msgData.peerInfo.alias,
                        pubKey: msgData.peerInfo.pubKey,
                        name: msgData.peerInfo.name,
                        joined: false,
                      });
                  }
                }
                loadedMsgsList.push({
                  time: msgData.time,
                  userPub: msgData.userPub,
                  userName: name,
                  msg: decMsg,
                  peerInfo: msgData.peerInfo
                });
                loadedMsgsList.sort((a, b) => a.time - b.time);
                cb(loadedMsgsList);
                gun.get('pchannel').get(channel.key).get('peers')
                  .get(gun.user().is.pub)
                  .get('new')
                  .put(null, () => {
                    gun.get('pchannel').get(channel.key).get('peers')
                      .get(gun.user().is.pub)
                      .get('new')
                      .put({ null: null });
                  });
              });
          });
        });
      }
      Object.keys(channel.peers).forEach((pubKey) => {
        if (pubKey === '_' || !channel.peers[pubKey]) return;
        gun.user().get('pchannel').get(channelKey).get('peers')
          .once((peerDataStr) => {
            if (!peerDataStr) return;
            const peerData = JSON.parse(peerDataStr);
            const peerChannelChatPath = gun.user(pubKey).get('pchannel')
              .get(channelKey)
              .get('chat');
            loadMsgsOf(peerChannelChatPath, peerData.name);
          });
      });
    }
  }

  return GunChat;

})));