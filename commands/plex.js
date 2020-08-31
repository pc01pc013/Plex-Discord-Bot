// plex api module -----------------------------------------------------------
var PlexAPI = require('plex-api');

// plex config ---------------------------------------------------------------
var plexConfig = require('../config/plex');

// plex commands -------------------------------------------------------------
var plexCommands = require('../commands/plex');

// plex client ---------------------------------------------------------------
var plex = new PlexAPI({
  hostname: plexConfig.hostname,
  port: plexConfig.port,
  username: plexConfig.username,
  password: plexConfig.password,
  token: plexConfig.token,
  options: {
    identifier: 'PlexBot',
    product: plexConfig.options.identifier,
    version: plexConfig.options.version,
    deviceName: plexConfig.options.deviceName,
    platform: plexConfig.options.platform,
    device: plexConfig.options.device
  }
});

// plex constants ------------------------------------------------------------
const PLEX_PLAY_START = 'http://' + plexConfig.hostname + ':' + plexConfig.port;
const PLEX_PLAY_END = '?X-Plex-Token=' + plexConfig.token;
const PLEX_PLAY_END_SEC = '&X-Plex-Token=' + plexConfig.token;
const PLEX_ARTISTS = '/library/sections/' + plexConfig.sectionsKey + '/all';

// plex variables ------------------------------------------------------------
var tracks = null;
var librarylist = null; //(/library/sections/X/all) Artists data
var librarysecdirctory = null; //Second library Artists data
var plexQuery = null;
var plexOffset = 0; // default offset of 0
var plexPageSize = 10; // default result size of 10
var isPlaying = false;
var isPaused = false;
var songQueue = []; // will be used for queueing songs
var playlistslist = null; //(/playlists) Playlists data

// plex vars for playing audio -----------------------------------------------
var dispatcher = null;
var voiceChannel = null;
var conn = null;

// plex functions ------------------------------------------------------------

// find song when provided with query string, offset, pagesize, and message
function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function findSong(query, offset, pageSize, message) {
  plex.query('/search/?type=10&query=' + query + '&X-Plex-Container-Start=' + offset + '&X-Plex-Container-Size=' + pageSize).then(function(res) {
    tracks = res.MediaContainer.Metadata;

    var resultSize = res.MediaContainer.size;
    plexQuery = query; // set query for !nextpage
    plexOffset = plexOffset + resultSize; // set paging

    var messageLines = '\n';
    var artist = '';

    if (resultSize == 1 && offset == 0) {
      songKey = 0;
      // add song to queue
      addToQueue(songKey, tracks, message);
    }
    else if (resultSize > 1) {
      for (var t = 0; t < tracks.length; t++) {
        if ('originalTitle' in tracks[t]) {
          artist = tracks[t].originalTitle;
        }
        else {
          artist = tracks[t].grandparentTitle;
        }
        messageLines += (t+1) + ' - ' + artist + ' - ' + tracks[t].title + '\n';
      }
      messageLines += '\n***!playsong (number)** to play your song.*';
      messageLines += '\n***!playall** to play All songs.*';
      messageLines += '\n***!nextpage** if the song you want isn\'t listed*';
      message.reply(messageLines);
    }
    else {
      message.reply('** I can\'t find a song with that title.**');
    }
  }, function (err) {
    console.log('narp');
  });
}


// not sure if ill need this
function addToQueue(songNumber, tracks, message, count = 1) {
  if (songNumber > -1 && count > 0){
    var key = tracks[songNumber].Media[0].Part[0].key;
    var artist = '';
    var title = tracks[songNumber].title;
    var thumb = tracks[songNumber].thumb;
    var parentTitle = tracks[songNumber].parentTitle;
    var songQueuenumtmp = songQueue.length;

    if ('originalTitle' in tracks[songNumber]) {
      artist = tracks[songNumber].originalTitle;
    }
    else {
      artist = tracks[songNumber].grandparentTitle;
    }

    for(var i=0; i<count; ++i){
      songQueue.push({'artist' : artist, 'title': title, 'key': key, 'thumb': thumb, 'parentTitle' : parentTitle});
    }
    if (songQueuenumtmp > 1) {
      message.reply('You have added **' + artist + ' - ' + title + '** to the queue.\n\n***!viewqueue** to view the queue.*');
    }

    if (!isPlaying) {
      playSong(message);
    }

  }
  else {
    message.reply('**Stop trying to break me.**');
  }
}

function addqueuelist(songNumber, tracks){
  var key = tracks[songNumber].Media[0].Part[0].key;
  var artist = '';
  var title = tracks[songNumber].title;
  var thumb = tracks[songNumber].thumb;
  var parentTitle = tracks[songNumber].parentTitle;

  if ('originalTitle' in tracks[songNumber]) {
    artist = tracks[songNumber].originalTitle;
  }
  else {
    artist = tracks[songNumber].grandparentTitle;
  }
  songQueue.push({'artist' : artist, 'title': title, 'key': key, 'thumb': thumb, 'parentTitle' : parentTitle});
  return 'You have added **' + artist + ' - ' + title + '** to the queue.';
}

function addALLToQueue(tracks, message, count = 1) {
  if(tracks != null && count > 0){
    for(var i=0; i<count; ++i){
      for (var t = 0; t < tracks.length; t++){
        var msg = addqueuelist(t, tracks);
        //message.reply(msg);
      }
    }
    if (!isPlaying) {
      playSong(message);
    }
    message.reply('*Use **!viewqueue** to view the queue.*');
  }
  else{
    message.reply('**Stop trying to break me.**');
  }
}

function RandomQuene(number, message){
  if(librarylist != null){
    var querylist = [];
    for(var i = 0;i<number;i++){
      var rndn=getRandomInt(librarylist.length);
      var artistkey =  librarylist[rndn].key;
      querylist.push(
        plex.query(artistkey).then(function(res){
          return res.MediaContainer.Metadata;
        }).then((libsec)=>{
          var secrn=getRandomInt(libsec.length);
          var tkkey=libsec[secrn].key;
          return plex.query(tkkey)
        }).then((ress)=>{
          var tk=ress.MediaContainer.Metadata;
          var songrn=getRandomInt(tk.length);
          var msg = addqueuelist(songrn, tk);
          //message.reply(msg);
        }).catch(reason => { 
          console.log(reason)
        })
      );
    }
    Promise.all(querylist).then(()=>{
      if (!isPlaying) {
        playSong(message);
      }
      message.reply('*Use **!viewqueue** to view the queue.*');
    }).catch(reason => { 
      console.log(reason)
    });
  }
  else{
    message.reply('**Artists Library Not Found**');
  }
}

// play song when provided with index number, track, and message
function playSong(message) {
  //voiceChannel = message.member.voiceChannel;

  if (isPlaying || isInVoiceChannel(message, true)) {
    if(!isPlaying){
      voiceChannel = message.member.voiceChannel;
    }
    voiceChannel.join().then(function(connection) {
      conn = connection;
      var url = PLEX_PLAY_START + songQueue[0].key + PLEX_PLAY_END;

      isPlaying = true;

      dispatcher = connection.playArbitraryInput(url).on('end', () => {
        songQueue.shift();
        if (songQueue.length > 0) {
          playSong(message);
        }
        // no songs left in queue, continue with playback completetion events
        else {
          playbackCompletion(message);
        }
      });
      dispatcher.setVolume(0.2);
    });

    // probbaly just change this to channel alert, not reply
    var thumburl = songQueue[0].thumb;
    var emburl = PLEX_PLAY_START + '/photo/:/transcode?url=' + thumburl + '&width=1000&height=1000' + PLEX_PLAY_END_SEC;
    var embedObj = {
      embed: {
        color: 4251856,
        author: {
          name: songQueue[0].title,
        },
        fields:
        [
          {
            name: 'Album',
            value: songQueue[0].parentTitle,
            inline: true
          },
          {
            name: 'Artist',
            value: songQueue[0].artist,
            inline: true
          },
        ],
        footer: {
          text: songQueue.length + ' song(s) in the queue'
        },
        thumbnail: {
          url: 'attachment://file.jpg',
        },
        files: [{
            attachment: emburl,
            name: 'file.jpg'
        }]
      }
    };
    message.channel.send('**Now playing:**\n', embedObj);
    //message.channel.send('**♪ ♫ ♪ Playing: ' + songQueue[0].artist + ' - ' + songQueue[0].title + ' ♪ ♫ ♪**');
  }
  else {
    //message.reply('**Please join a voice channel first before requesting a song.**')
    isPlaying = false;
  }
}

// run at end of songQueue / remove bot from voiceChannel
function playbackCompletion(message) {
  conn.disconnect();
  voiceChannel.leave();
  isPlaying = false;
}

function isInVoiceChannel(message, isreply=false){
  var voiceChanneltmp = message.member.voiceChannel;
  if(voiceChanneltmp){
    return true;
  }
  else{
    if(isreply){
      message.reply('**Please join a voice channel first before requesting a song.**');
    }
  }
  return false;
}

function findAll(result, message){
  plex.query(PLEX_ARTISTS).then(function(res){
    librarylist = res.MediaContainer.Metadata;
    var text = 'Add Library All Artists Success.';
    console.log(text);
    if(result == true){
      message.reply('**' + text + '**');
    }
  }, function (err) {
    console.log(err);
    console.log('narp');
  });
}

function findAllPlaylists(result, message){
  plex.query('/playlists').then(function(res){
    playlistslist = res.MediaContainer.Metadata;
    var text = 'Add All Playlists Data Success.';
    console.log(text);
    if(result == true){
      message.reply('**' + text + '**');
    }
  }, function (err) {
    console.log(err);
    console.log('narp');
  });

}

function showall(message){
  var messageLines = '';
  var tmpnum=0;
  var embedObj = null;
  for (var t = 0; t < librarylist.length; t++) {
    messageLines += (t+1) + ' - '  + librarylist[t].title + '\n';

    if(t %100==99){
      if(t+1==librarylist.length){
        messageLines += '\n*Use **!shows (number)** To See the Artist Detials*\n';
      }
      embedObj = {
        embed: {
          color: 16741921,
          description: messageLines,
        }
      };
      message.channel.send('\n**Artists('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
      messageLines = '';
      tmpnum=t+1;
    }
  }
  if(messageLines != ''){
    messageLines += '\n*Use **!shows (number)** To See the Artist Detials*\n';
    embedObj = {
      embed: {
        color: 16741921,
        description: messageLines,
      }
    };
    message.channel.send('\n**Artists('+ (tmpnum+1) + '~' + librarylist.length + '):**\n\n', embedObj);
  }
}

function showsecArtists(number, message){
  var artistkey =  librarylist[number].key;
  plex.query(artistkey).then(function(res){
    librarysecdirctory = res.MediaContainer.Metadata;
    
    var messageLines = '';
    var authortext = res.MediaContainer.parentTitle;
    var embedObj = null;
    var tmpnum = 0;
    for (var t = 0; t < librarysecdirctory.length; t++) {
      messageLines += (t+1) + ' - '  + librarysecdirctory[t].title + '\n';

      if(t %50==49){
        if(t+1==librarysecdirctory.length){
          messageLines += '\n*Use **!showt (number)** To See the Track Detials*\n';
        }
        embedObj = {
          embed: {
            color: 16741921,
            description: messageLines,
            author: {
              name: authortext,
            },
          }
        };
        message.channel.send('\n**All Tracks('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
        messageLines = '';
        tmpnum=t+1;
      }
    }
    if(messageLines != ''){
      messageLines += '\n*Use **!showt (number)** To See the Track Detials*\n';
      var embedObj = {
        embed: {
          color: 16741921,
          description: messageLines,
          author: {
            name: authortext,
          },
        }
      };
      message.channel.send('\n**All Tracks('+ (tmpnum+1) + '~' + librarysecdirctory.length + '):**\n\n', embedObj);
    }
  }, function (err) {
    console.log(err);
    console.log('narp');
  });
}

function showTracksbysecArtist(number, message){
  var trackkey =  librarysecdirctory[number].key;

  plex.query(trackkey).then(function(res){
    tracks = res.MediaContainer.Metadata;
    var thumburl = res.MediaContainer.thumb;

    var messageLines = '';
    var artist = '';
    var embedObj = null;
    var authortext = res.MediaContainer.title1 + ' - ' + res.MediaContainer.title2;
    var tmpnum = 0;
    var emburl = PLEX_PLAY_START + '/photo/:/transcode?url=' + thumburl + '&width=1000&height=1000' + PLEX_PLAY_END_SEC;

    for (var t = 0; t < tracks.length; t++) {
      if ('originalTitle' in tracks[t]) {
        artist = tracks[t].originalTitle;
      }
      else {
        artist = tracks[t].grandparentTitle;
      }
      messageLines += (t+1) + ' - ' + artist + ' - ' + tracks[t].title + '\n';

      if(t %50==49){
        if(t+1==tracks.length){
          messageLines += '\n***!playsong (number)** to play your song.*\n';
          messageLines += '***!playall** to play All songs.*\n';
        }
        embedObj = {
          embed: {
            color: 16741921,
            description: messageLines,
            author: {
              name: authortext,
            },
            thumbnail: {
              url: 'attachment://file.jpg',
            },
            files: [{
                attachment: emburl,
                name: 'file.jpg'
            }]
          }
        };
        message.channel.send('\n**All Songs('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
        messageLines = '';
        tmpnum=t+1;
      }
    }

    if(messageLines != ''){
      messageLines += '\n***!playsong (number)** to play your song.*\n';
      messageLines += '***!playall** to play All songs.*\n';
      embedObj = {
        embed: {
          color: 16741921,
          description: messageLines,
          author: {
            name: authortext,
          },
          thumbnail: {
            url: 'attachment://file.jpg',
          },
          files: [{
              attachment: emburl,
              name: 'file.jpg'
          }]
        }
      };
      message.channel.send('\n**All Songs('+ (tmpnum+1) + '~' + tracks.length + '):**\n\n', embedObj);
    }
  }, function (err) {
    console.log(err);
    console.log('narp');
  });
}

function ShowPlaylists(message){
  var messageLines = '';
  var tmpnum=0;
  var embedObj = null;
  for (var t = 0; t < playlistslist.length; t++) {
    messageLines += (t+1) + ' - '  + playlistslist[t].title + '\n';

    if(t %100==99){
      if(t+1==playlistslist.length){
        messageLines += '\n*Use **!showpt (number)** To See the Playlist Detials*\n';
      }
      embedObj = {
        embed: {
          color: 16741921,
          description: messageLines,
        }
      };
      message.channel.send('\n**Playlists('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
      messageLines = '';
      tmpnum=t+1;
    }
  }
  if(messageLines != ''){
    messageLines += '\n*Use **!showpt (number)** To See the Playlist Detials*\n';
    embedObj = {
      embed: {
        color: 16741921,
        description: messageLines,
      }
    };
    message.channel.send('\n**Playlists('+ (tmpnum+1) + '~' + playlistslist.length + '):**\n\n', embedObj);
  }
}

function showPlaylistDetials(number, message){
  var playlistkey =  playlistslist[number].key;
  plex.query(playlistkey).then(function(res){
    tracks = res.MediaContainer.Metadata;
    
    var messageLines = '';
    var artist = '';
    var authortext = 'Playlist - ' + res.MediaContainer.title;
    var tmpnum=0;
    var embedObj = null;

    for (var t = 0; t < tracks.length; t++) {
      if ('originalTitle' in tracks[t]) {
        artist = tracks[t].originalTitle;
      }
      else {
        artist = tracks[t].grandparentTitle;
      }
      messageLines += (t+1) + ' - ' + artist + ' - ' + tracks[t].title + '\n';

      if(t %50==49){
        if(t+1==tracks.length){
          messageLines += '\n***!playsong (number)** to play your song.*\n';
          messageLines += '***!playall** to play All songs.*\n';
        }
        embedObj = {
          embed: {
            color: 16741921,
            description: messageLines,
            author: {
              name: authortext,
            },
          }
        };
        message.channel.send('\n**All Songs('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
        messageLines = '';
        tmpnum=t+1;
      }
    }
    if(messageLines != ''){
      messageLines += '\n***!playsong (number)** to play your song.*\n';
      messageLines += '***!playall** to play All songs.*\n';
      embedObj = {
        embed: {
          color: 16741921,
          description: messageLines,
          author: {
            name: authortext,
          },
        }
      };
      message.channel.send('\n**All Songs('+ (tmpnum+1) + '~' + tracks.length + '):**\n\n', embedObj);
    }
  }, function (err) {
    console.log(err);
    console.log('narp');
  });
}
// plex commands -------------------------------------------------------------
var commands = {
  'plexTest' : {
    usage: '',
    description: 'test plex at bot start up to make sure everything is working',
    process: function() {
      plex.query('/').then(function(result) {
        console.log('name: ' + result.MediaContainer.friendlyName);
        console.log('v: ' + result.MediaContainer.version);
      }, function(err) {
        console.log('ya done fucked up');
      });
    }
  },
  'clearqueue' : {
    usage: '',
    description: 'clears all songs in queue',
    process: function(client, message) {
      if (songQueue.length > 0) {
        songQueue = []; // remove all songs from queue

        message.reply('**The queue has been cleared.**');
      }
      else {
        message.reply('**There are no songs in the queue.**');
      }
    }
  },
  'nextpage' : {
    usage: '',
    description: 'get next page of songs if desired song not listed',
    process: function(client, message, query) {
      findSong(plexQuery, plexOffset, plexPageSize, message);
    }
  },
  'pause' : {
    usage: '',
    description: 'pauses current song if one is playing',
    process: function(client, message) {
      if (isPlaying) {
        dispatcher.pause(); // pause song
        isPaused = true;
        var embedObj = {
          embed: {
            color: 16424969,
            description: '**Playback has been paused.**',
          }
        };
        message.channel.send('**Update:**', embedObj);
      }
      else {
        message.reply('**Nothing currently playing.**');
      }
    }
  },
  'play' : {
    usage: '<song title or artist>',
    description: 'bot will join voice channel and play song if one song available.  if more than one, bot will return a list to choose from',
    process: function(client, message, query) {
      // if song request exists
      if (query.length > 0) {
        plexOffset = 0; // reset paging
        plexQuery = null; // reset query for !nextpage

        findSong(query, plexOffset, plexPageSize, message);
      }
      else {
        message.reply('**Please enter a song title**');
      }
    }
  },
  'playsong' : {
    usage: '<song number> [count]',
    description: 'play a song from the generated song list, you can give the count number to play it more than once.',
    process: function(client, message, query) {
      var querynum = query.split(' ');
      var songNumber = querynum[0];
      var count = 1;
      songNumber = parseInt(songNumber);
      songNumber = songNumber - 1;

      if(querynum.length >1){
        count =  querynum[1];
      }

      if(isInVoiceChannel(message, true)){
        addToQueue(songNumber, tracks, message, count);
      }
    }
  },
  'removesong' : {
    usage: '<song queue number>',
    description: 'removes song by index from the song queue',
    process: function(client, message, query) {
      var songNumber = query;
      songNumber = parseInt(songNumber);
      songNumber = songNumber - 1;

      if (songQueue.length > 0 ) {
        if (songNumber > -1 && songNumber <= songQueue.length) {
          // remove by index (splice)
          var removedSong = songQueue.splice(songNumber, 1);
          message.reply('**You have removed ' + removedSong[0].artist + ' - ' + removedSong[0].title + ' from the queue.**');
          // message that it has been removed
        }
        else {
          message.reply('**Stop trying to break me.**');
        }
      }
      else {
        message.reply('**There are no songs in the queue.**');
      }
    }
  },
  'resume' : {
    usage: '',
    description: 'skips the current song if one is playing and plays the next song in queue if it exists',
    process: function(client, message) {
      if (isPaused) {

        dispatcher.resume(); // run dispatcher.end events in playSong
        var embedObj = {
          embed: {
            color: 4251856,
            description: '**Playback has been resumed.**',
          }
        };
        message.channel.send('**Update:**', embedObj);
      }
      else if(!isPlaying && songQueue.length > 0){
        playSong(message);
      }
      else {
        message.reply('**Nothing is paused.**');
      }
    }
  },
  'skip' : {
    usage: '',
    description: 'skips the current song if one is playing and plays the next song in queue if it exists',
    process: function(client, message) {
      if (isPlaying) {
        message.channel.send(songQueue[0].artist + ' - ' + songQueue[0].title + ' has been **skipped.**');
        dispatcher.end(); // run dispatcher.end events in playSong
      }
      else {
        message.reply('**Nothing currently playing.**');
      }
    }
  },
  'stop' : {
    usage: '',
    description: 'stops song if one is playing',
    process: function(client, message) {
      if (isPlaying) {
        songQueue = []; // removes all songs from queue
        dispatcher.end(); // stop dispatcher from playing audio

        var embedObj = {
          embed: {
            color: 10813448,
            description: '**Playback has been stopped.**',
          }
        };
        message.channel.send('**Update:**', embedObj);
      }
      else {
        message.reply('**Nothing currently playing.**');
      }
    }
  },
  'viewqueue' : {
    usage: '',
    description: 'displays current song queue',
    process: function(client, message) {
      //var messageLines = '\n**Song Queue:**\n\n';

      var messageLines = '';
      var tmpnum=0;

      if (songQueue.length > 0) {
        for (var t = 0; t < songQueue.length; t++) {
          messageLines += (t+1) + ' - ' + songQueue[t].artist + ' - ' + songQueue[t].title + '\n';

          if(t %50==49){
            if(t+1==songQueue.length){
              messageLines += '\n***!removesong (number)** to remove a song*';
              messageLines += '\n***!skip** to skip the current song*';
            }
            embedObj = {
              embed: {
                color: 2389639,
                description: messageLines,
              }
            };
            message.channel.send('\n**Song Queue('+ (tmpnum+1) + '~' + (t+1) + '):**\n\n', embedObj);
            messageLines = '';
            tmpnum=t+1;
          }
        }
        if(messageLines != ''){
          messageLines += '\n***!removesong (number)** to remove a song*';
          messageLines += '\n***!skip** to skip the current song*';
          embedObj = {
            embed: {
              color: 2389639,
              description: messageLines,
            }
          };
          message.channel.send('\n**Song Queue('+ (tmpnum+1) + '~' + songQueue.length + '):**\n\n', embedObj);
        }
      }
      else {
        message.reply('**There are no songs in the queue.**');
      }
    }
  },
  'findAll' : {
    usage: '',
    description: 'find All Library Artists Lists',
    process: function() {
      findAll(false);
    }
  },
  'showall' : {
    usage: '',
    description: 'Show All Library Artists Lists',
    process: function(client, message) {
      showall(message);
    }
  },
  'shows' : {
    usage: '<artist number>',
    description: 'Show Select Artist Detials',
    process: function(client, message, query) {
      if(librarylist != null){
        var num = query;
        num = parseInt(num);
        num = num - 1;
        if(num >= 0){
          showsecArtists(num,message);
        }
        else{
          message.reply('**Please enter a Valid Number**');
        }
      }
      else{
        message.reply('**Artists Library Not Found**');
      }
    }
  },
  'showt' : {
    usage: '<track number>',
    description: 'Show Select Track Detials',
    process: function(client, message, query) {
      if(librarysecdirctory != null){
        var num = query;
        num = parseInt(num);
        num = num - 1;
        if(num >= 0){
          showTracksbysecArtist(num,message);
        }
        else{
          message.reply('**Please enter a Valid Number**');
        }
      }
      else{
        message.reply('*Do Not Have Second Artists Library Data*');
        message.reply('*Please Try  **!shows** For Search Second Artists Library Data*');
      }
    }
  },
  'playall' : {
    usage: '[count]',
    description: 'play all song from the generated song list, you can give the count number to play it more than once.',
    process: function(client, message, query) {
      if(isInVoiceChannel(message, true)){
        var tnum = parseInt(query);
        var count = 1;
        if(!isNaN(tnum)){
          count = tnum;
        }
        addALLToQueue(tracks, message, count);
      }
    }
  },
  'rng' : {
    usage: '<total number>',
    description: 'play random songs from the random tracks from the random Artists',
    process: function(client, message, query) {
      if(isInVoiceChannel(message, true)){
        var num = parseInt(query);
        if(isNaN(num)){
          num = 0;
        }
        if(num > 0 && num<=99){
          RandomQuene(num,message);
        }
        else{
          message.reply('**Please enter a Valid Number (1~99)**');
        }
      }
    }
  },
  'findAllPlaylists' : {
    usage: '',
    description: 'find All Playlists',
    process: function() {
      findAllPlaylists(false);
    }
  },
  'showptall' : {
    usage: '',
    description: 'Show All Playlists',
    process: function(client, message) {
      ShowPlaylists(message);
    }
  },
  'showpt' : {
    usage: '<playlist number>',
    description: 'Show Select Playlist Detials',
    process: function(client, message, query) {
      if(playlistslist != null){
        var num = query;
        num = parseInt(num);
        num = num - 1;
        if(num >= 0){
          showPlaylistDetials(num,message);
        }
        else{
          message.reply('**Please enter a Valid Number**');
        }
      }
      else{
        message.reply('*Do Not Have All Playlists Data*');
        message.reply('*Please Try  **!showptall** For Search All Playlists Data*');
      }
    }
  },
  'refreshplaylists' : {
    usage: '',
    description: 'Refresh All Playlists Data',
    process: function(client, message) {
      findAllPlaylists(true, message);
    }
  },
  'refreshartists' : {
    usage: '',
    description: 'Refresh All Library Artists Lists',
    process: function(client, message) {
      findAll(true, message);
    }
  },
  'help' : {
    usage: '',
    description: 'HELP!',
    process: function(client, message) {
      var messageLines = '\n';
      messageLines += '***!rng <total num>**  : All songs shuffle*\n';
      messageLines += '***!showall** :  Show All Library Artists Lists*\n';
      messageLines += '***!shows <number>** :  Show Select Artist Detials*\n';
      messageLines += '***!showt <number>** :  Show Select Track Detials*\n';
      messageLines += '***!showptall** :  Show All Playlists*\n';
      messageLines += '***!showpt <number>** :  Show Select Playlist Detials*\n';
      messageLines += '***!play <song title or artist>** : bot will join voice channel and play song if one song available. if more than one, bot will return a list to choose from*\n';
      messageLines += '***!playsong <song number> [count]** : plays a song from the generated song list, you can give the count number to play it more than once.*\n';
      messageLines += '***!playall [count]** :  play all songs from the generated song list*\n';
      messageLines += '***!pause** :  pauses current song if one is playing*\n';
      messageLines += '***!removesong <song queue number>** : removes song by index from the song queue*\n';
      messageLines += '***!resume** : resumes song if previously paused*\n';
      messageLines += '***!skip** : skips the current song if one is playing and plays the next song in queue if it exists*\n';
      messageLines += '***!stop** : stops song if one is playing*\n';
      messageLines += '***!viewqueue** : displays current song queue*\n';
      messageLines += '***!clearqueue**  : clears all songs in queue*\n';
      messageLines += '***!refreshplaylists** :  Refresh All Playlists Data*\n';
      messageLines += '***!refreshartists** :  Refresh All Library Artists Lists*\n';
      message.reply(messageLines);
    }
  },
};

module.exports = commands;
