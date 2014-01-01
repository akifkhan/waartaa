const REGEX = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/g;

updateHeight = function () {
  var body_height = $('body').height();
  var final_height = body_height - 90;
  $('#chat, #chat-main, .chatroom').height(final_height - 23);
  $('#info-panel .panel-body, #chat-servers .panel-body').height(final_height - 75);
  $('#info-panel .inner-container').css('min-height', final_height);
  $('.chatlogrows').css('min-height', final_height - 22);
  //var topic_height = Session.get('topicHeight') || 0;
  $('.chat-logs-container')//.height(final_height - 69);
  .each(function (index, elem) {
    var $topic = $(elem).prev('.topic');
    $(elem).height((final_height - $topic.height() || 0) - 25);
  });
}


Template._loginButtonsLoggedInDropdown.created = function () {
  NProgress.start();
}

Template.add_server_modal.created = function () {
  NProgress.done();
}

Deps.autorun(highlightChannel);
Deps.autorun(updateHeight);


Template.chat_main.chat_logs = function () {
  var room_id = Session.get('room_id');
  if (Session.get('roomtype') == 'channel') {
    return UserChannelLogs.find({channel_id: room_id});
  } else if (Session.get('roomtype') == 'pm') {
    var nick = room_id.substr(room_id.indexOf('-') + 1);
    return PMLogs.find({
      $or: [
        {from: nick, to_user_id: Meteor.user()._id},
        {from_user_id: Meteor.user()._id, to: nick}
      ]
    });
  } else if (Session.get('roomtype') == 'server') {
    var server_id = Session.get('room_id');
    return UserServerLogs.find({server_id: server_id});
  }
}

Template.chat_main.topic = function () {
  try {
    var channel = UserChannels.findOne({_id: Session.get('room_id')});
    if (channel) {
      return channel.topic || "";
    }
  } catch (err) {
    return "";
  }
};

Template.chat_main.rendered = updateHeight;

function observeChatlogTableScroll () {
  var $table = $(this.find('.chatlogs-table'));
  var $container = $table.parent();
  var id = $table.attr('id');
  var old_table_height = Session.get('height-' + id, 0);
  var new_table_height = $table.find('.chatlogrows').height();
  if (Session.get('selfMsg-' + id) ||
      Session.get('chatlogsScrollEnd-' + id) &&
      Session.get('chatlogsScrollEnd-' + id) == $table.scrollTop()) {
    $container.nanoScroller({ scroll: 'bottom' });
    Session.set('selfMsg-' + id);
  } else if ($table.scrollTop() == 0 && new_table_height > old_table_height) {
    $container.nanoScroller({scrollTop: (new_table_height - old_table_height)});
  }
  Session.set('height-' + id, new_table_height);
  Meteor.setTimeout(function () {
    $table.off('scrolltop').on('scrolltop', chatLogsContainerScrollCallback);
  }, 2000);
}

Template.channel_chat_logs_table.rendered = observeChatlogTableScroll;
Template.server_chat_logs_table.rendered = observeChatlogTableScroll;
Template.pm_chat_logs_table.rendered = observeChatlogTableScroll;

Template.chat_row.rendered = function () {};

function chatLogsContainerScrollCallback (event) {
    var scroll_top = $(event.target).scrollTop();
    var $target = $(event.target);
    var $table = $target.find('.chatlogs-table');
    $table.off('scrolltop');
    console.log("Reached top of page.");
    var key = '';
    if ($table.hasClass('channel'))
      key = "user_channel_log_count_" + $target.data('channel-id');
    else if ($table.hasClass('server'))
      key = "user_server_log_count_" + $target.data('server-id');
    else if ($table.hasClass('pm'))
      key = "pmLogCount-" + $target.data('server-id') + '_' + $target.data('nick');
    var current_count = Session.get(key, 0);
    Session.set('height-' + $table.attr('id'), $table.find('.chatlogrows').height());
    console.log('current table height: ' + Session.get('height-' + $table.attr('id')));
    var room_id = Session.get('room_id');
    if ((event.target.scrollHeight - scroll_top) <= $(event.target).outerHeight())
      scroll_top = null;
    var roomtype = Session.get('roomtype');
    if (roomtype == 'channel')
      Session.set('scroll_height_channel-' + room_id,
        scroll_top);
    else if (roomtype == 'pm')
      Session.set('scroll_height_' + room_id,
        scroll_top);
    else if (roomtype == 'server')
      Session.set('scroll_height_server-' + Session.get('server_id'),
        scroll_top);
    Session.set(key, current_count + DEFAULT_LOGS_COUNT);
  }

Template.channel_logs.events = {
  'scrolltop .chat-logs-container': chatLogsContainerScrollCallback
};

Template.server_logs.events = {
  'scroll .chat-logs-container': chatLogsContainerScrollCallback
};

Template.pm_logs.events = {
  'scroll .chat-logs-container': chatLogsContainerScrollCallback
};

$(document).on(
  'scrollend.chat_logs_container', '.chat-logs-container',
  function (e) {
    var $table = $(e.target).find('.chatlogs-table');
    Session.set('chatlogsScrollEnd-' + $table.attr('id'), $table.scrollTop());
  });

function _getMatchingNicks (term) {
  var nicks = [];
  console.log(term);
  var channel = null;
  if (Session.get('roomtype') == 'channel') {
    channel = UserChannels.findOne({_id: Session.get('room_id')});
  }
  if (!channel)
    return;
  ChannelNickSugesstions.find(
    {
      nick: {$regex: '^' + term + '.+'},
      channel_name: channel.name,
      server_name: channel.user_server_name
    },
    {nick: 1}
  ).forEach(function (nick) {
    nicks.push(nick.nick);
  });
  return nicks;
}

ChannelNickSugesstions = new Meteor.Collection("channel_nick_suggestions");

function autocompleteNicksInitiate () {
  function split (val) {
    return val.split(/(^|[\ ]+)/ );
  }

  function extractLast ( term ) {
    return split(term).pop();
  }

  var auto_suggest = false;

  $('#chat-input')
    .bind('keydown', function (event) {
      if (Session.get('roomtype') != 'channel')
        return;
      if (event.keyCode === $.ui.keyCode.TAB) {
        event.preventDefault();
        if ($( this ).data( "ui-autocomplete" ).menu.active)
          return;
        auto_suggest = true;
        $('#chat-input').autocomplete('search', extractLast($(event.target).val()));
      } else if (event.keyCode === $.ui.keyCode.SPACE)
        auto_suggest = false;
    })
    .autocomplete({
      autoFocus: true,
      minLength: 1,
      source: function( request, response ) {
        // delegate back to autocomplete, but extract the last term
        var channel = UserChannels.findOne({_id: Session.get('room_id')});
        if (!channel)
          return;
        Meteor.subscribe(
          'channel_nick_suggestions', channel.user_server_name, channel.name,
          request.term, 10, function () {
            response( $.ui.autocomplete.filter(
              _getMatchingNicks(request.term), extractLast( request.term ) ) );
          }
        );
      },
      search: function (event, ui) {
        console.log(event);
        var $input = $('#chat-input');
        var val = $input.val() || "";
        console.log(auto_suggest);
        return auto_suggest;
      },
      focus: function() {
        // prevent value inserted on focus
        return false;
      },
      select: function( event, ui ) {
        var terms = split( this.value );
        // remove the current input
        terms.pop();
        // add the selected item
        terms.push( ui.item.value );
        this.value = terms.join( "" );
        if (this.value.length >= 1 && this.value[0] == "")
          this.value = this.value.substr(1);
        return false;
      },
      open: function($event, ui) {
          var $widget = $("ul.ui-autocomplete");
          var $input = $("#chat-input");
          var position = $input.position();

          var top_offset = $widget.find('li').length * 24;
          if (top_offset > 200)
            top_offset = 200;
          $("#chat-input-form").append($widget);
          $widget.width('auto')
            .css('max-height', 200)
            .css('overflow', 'auto')
            .css("left", position.left + $input.val().length * 6)
            .css("bottom", 36)
            .css("top", - top_offset - 2);
      }
    });
}

function refreshAutocompleteNicksSource () {
  $('chat-input').autocomplete('option', 'source', []);
}

function getChannelNicks () {
  var channel_nicks = [];
  var channel = UserChannels.findOne({_id: Session.get('room_id')}, {name: 1, user_server_name: 1}) || {};
  ChannelNicks.find({
    server_name: channel.user_server_name, channel_name: channel.name
  }).forEach(function (channel_nick) {
    channel_nicks.push(channel_nick.nick);
  });
  return channel_nicks;
} 

Handlebars.registerHelper("isCurrentRoom", function (room_id, room_type, server_id) {
  if (room_id == "ohB9cwuTsTnHMxT7T")
    return true;
  return false;
  /*
  var session_roomtype = Session.get('roomtype');
  var session_room_id = Session.get('room_id');
  var session_server_id = Session.get('server_id');
  if (session_roomtype = room_type && session_room_id == room_id && session_server_id == server_id)
    return true;
  return false;*/
});



Handlebars.registerHelper('pms', function (id) {
  var server = UserServers.findOne({_id: id});
  var user = Meteor.user();
  var pms = [];
  try {
    var pms = user.profile.connections[id].pms;
  } catch (err) {}
  var return_pms = [];
  for (nick in pms)
    return_pms.push({name: nick, server_id: server._id, room_id: server._id + '_' + nick});
  return return_pms;
});

Handlebars.registerHelper('currentPM', function () {
  var server = UserServers.findOne({_id: Session.get('server_id')});
  var user = Meteor.user();
  if (Session.get('roomtype') === 'pm') {
    var room_id = Session.get('room_id');
    var server_id = room_id.split('_')[0];
    var nick = room_id.split('_')[1];
    return {name: nick, server_id: server._id, room_id: server._id + '_' + nick};
  }
});

Handlebars.registerHelper('currentServer', function () {
  if (!Session.get('roomtype') != 'server')
    return;
  return server = UserServers.findOne({_id: Session.get('server_id')});
});

function chatUserClickHandler (event) {
    if ($(event.target).hasClass('btn-group') || $(event.target).parent().hasClass('btn-group'))
      return;
    event.stopPropagation();
    //$('.channel-user').parent().removeClass('active');
    $('.dropdown.open, .btn-group.open').removeClass('open');
    //$(event.target).parent().addClass('active');
}


Handlebars.registerHelper('channel_users', function (id) {
  var channel_id = id;
  var channel = UserChannels.findOne({_id: channel_id});
  if (!channel)
    return;
  var query = {
    channel_name: channel.name, server_name: channel.user_server_name};
  var last_nick = Session.get(
    'lastNick-' + channel.user_server_name + '_' + channel.name);
  if (last_nick)
    query['nick'] = {$gt: last_nick};
  return ChannelNicks.find(
    query,
    {fields: {nick: 1}, sort: {nick: 1}});
});

Template.chat_users.rendered = updateHeight;

Template.info_panel_body.rendered = function () {
  $('#info-panel .nano').nanoScroller();
}



/*Template.chat_main.rendered = function () {
  setTimeout(function () {
    updateHeight();
    var roomtype = Session.get('roomtype');
    var key = '';
    var room_id = Session.get('room_id');
    if (roomtype == 'channel')
      key = 'scroll_height_channel-' + room_id;
    else if (roomtype == 'pm')
      key = 'scroll_height_' + room_id;
    else if (roomtype == 'server')
      key = 'scroll_height_server-' + room_id;
    var chat_height = Session.get(key);
    //$('#chat-logs-container').scrollTop(chat_height || $('#chat-logs').height());
  }, 0);
};*/

Template.chat_main.destroyed = function () {
  var roomtype = Session.get('roomtype');
  if (roomtype == 'channel') {
    prefix = roomtype + '-';
    Session.set('scroll_height_' + prefix + Session.get('room_id'), $('#chat-logs-container').scrollTop());
  }
};

Client = {};

Meteor.subscribe("client", Meteor.user() && Meteor.user().username);

Handlebars.registerHelper("linkify", function (message) {
 return new Handlebars.SafeString(
   message.replace(REGEX, function(match) {
     return "<a target='_blank' href='" + match + "'>" + match + "</a>";
   })
 );
});

Template.chat_users.events = {
  'click .channel-user': chatUserClickHandler,
};

Template.user_menu.events = {
  'click .pm-user': function (event) {
    var $target = $(event.target);
    var nick = $target.data('user-nick');
    var user = Meteor.user();
    var server_id = $target.parents('.info-panel-item').data('server-id');
    var profile = user.profile;
    if (!profile)
      profile = {connections: {}};
    if (!profile.connections[server_id])
      profile.connections[server_id] = {pms: {}};
    if (!profile.connections[server_id].pms)
      profile.connections[server_id].pms = {};
    profile.connections[server_id].pms[nick] = '';
    console.log(profile);
    Meteor.users.update({_id: user._id}, {$set: {profile: profile}});
    $('.info-panel-item.active').removeClass('active');
    Session.set('roomtype', 'pm');
    Session.set('room_id', server_id + '_' + nick);
    var server = UserServers.findOne({_id: server_id});
    if (server)
      Meteor.call(
        'send_command', server.name, '/WHOIS ' + nick);
  },
  'click .whois-user': function (event) {
    var $target = $(event.target);
    var nick = $target.data('user-nick');
    var user = Meteor.user();
    var server_id = $target.parents('.info-panel-item').data('server-id');
    var server = UserServers.findOne({_id: server_id});
    var roomtype = Session.get('roomtype');
    var room_id = Session.get('room_id');
    Meteor.call(
      'send_command', server.name, '/WHOIS ' + nick, {
        room_id: room_id,
        roomtype: roomtype
    });
  }
};

Template.chat_input.rendered = function () {
  autocompleteNicksInitiate();
}



//$('.editServerChannelLink').live('click', _handleServerChannelEditLinkClick);

Template.channel_menu.rendered = function (e) {
  //Template.channel_menu.events[
  //  'click .editServerChannelLink'] =  _handleServerChannelEditLinkClick;
}





Template.channel_logs.rendered = function () {
  //console.log("CREATED channel_logs");
};



Handlebars.registerHelper("activeChannels", function () {
  return UserChannels.find({active: true});
});

Handlebars.registerHelper("activeServers", function () {
  return UserServers.find();
});

cursors_observed = {};



var focussed = true;

window.onfocus = function () {
  focussed = true;
};

window.onblur = function () {
  focussed = false;
}

Handlebars.registerHelper("channelChatLogs", function (channel_id) {
  var cursor = UserChannelLogs.find({channel_id: channel_id}, {sort: {created: 1}});
  var session_key = 'unreadLogsCountChannel-' + channel_id;
  cursor.observeChanges({
    added: function (id, fields) {
      Deps.nonreactive(function () {
        var new_logs = updateUnreadLogsCount(
          session_key, 'lastAccessedChannel-' + fields.channel_id,
          fields.last_updated);
        var user_server = UserServers.findOne({_id: fields.server_id});
        if (!user_server)
          return;
        if (
          new_logs > 0 &&
          fields.message.search(user_server.current_nick) >= 0 &&
          (
            (Session.get('roomtype') == 'channel' &&
              Session.get('room_id') != fields.channel_id) ||
            Session.get('roomtype') != 'channel')
          ) {
            var alert_message = fields.server_name + fields.channel_name + ': ' + fields.message;
            $.titleAlert(alert_message, {
              requireBlur:true,
              stopOnFocus:true,
              duration:10000,
              interval:500
            });
          $('#audio-notification')[0].play();
        }
      });
    }
  });
  cursor.limit = 25;
  return cursor;
});

Handlebars.registerHelper("serverChatLogs", function (server_id) {
  var cursor = UserServerLogs.find(
    {server_id: server_id}, {sort: {created: 1}});
  var session_key = 'unreadLogsCountServer_' + server_id;
  cursor.observeChanges({
    added: function (id, fields) {
      Deps.nonreactive(function () {
        updateUnreadLogsCount(
          session_key, 'lastAccessedServer-' + fields.server_id,
          fields.last_updated)
      });
    }
  });
  return cursor;
});

Handlebars.registerHelper("pmChatLogs", function (server_id, nick) {
  var cursor = PMLogs.find(
    {
      $or: [{from: nick}, {to_nick: nick}],
      server_id: server_id
    }, {sort: {created: 1}});
  var session_key = "unreadLogsCountPm-" + server_id + '_' + nick;
  cursor.observeChanges({
    added: function (id, fields) {
      Deps.nonreactive(function () {
        new_logs = updateUnreadLogsCount(
          session_key, 'lastAccessedPm-' + fields.server_id + '_' + nick,
          fields.last_updated);
        if (
            new_logs > 0 &&
            Session.get('room_id') != fields.server_id + '_' + nick) {
          var alert_message = nick + ' messaged you: ' + fields.message;
          $.titleAlert(alert_message, {
            requireBlur:true,
            stopOnFocus:true,
            duration:10000,
            interval:500
          });
          $('#audio-notification')[0].play();
        }
      });
    }
  });
  return cursor;
});

Handlebars.registerHelper("unread_logs_count", function (
    room_type, room_id, nick) {
  if (room_type == "pm")
    room_id = room_id + '_' + nick;
  var room_type = room_type[0].toUpperCase() + room_type.substr(1);
  var key = "unreadLogsCount" + room_type + "-" + room_id;
  var count = Session.get(key);
  if (count > 0 && Session.get('room_id') != room_id)
    return count;
  else {
    Session.set(key, 0);
    return '';
  }
});

Handlebars.registerHelper("server_current_nick", function () {
  var user_server = UserServers.findOne({_id: Session.get('server_id')});
  if (user_server) {
    return user_server.current_nick;
  }
})

$('.whois-tooltip, .tipsy-enable').tipsy({live: true, gravity: 'e', html: true});
$('#server-add-btn.enable-tipsy').tipsy({live: true, gravity: 's'});

function _get_nick_whois_data (nick, user_server_id) {
  var user_server = UserServers.findOne({_id: user_server_id});
  if (!user_server)
    return;
  return ServerNicks.findOne({
    nick: nick, server_id: user_server.server_id});
}

Handlebars.registerHelper('whois_tooltip', function (nick, server_name) {
  var tooltip = "";
  var server_id = (UserServers.findOne({name: server_name}, {_id: 1}) || {})._id;
  var whois_data = _get_nick_whois_data(nick, server_id);
  if (whois_data)
    tooltip = "Username: " + _.escape(whois_data.user) + "<br/>" +
      "Real name: " + _.escape(whois_data.realname) + "<br/>" +
      "Server: " + _.escape(whois_data.server) + "<br/>";
  return new Handlebars.SafeString(tooltip);
});

Handlebars.registerHelper('getCurrentPMNickInfo', function () {
  var room_id = Session.get('room_id');
  if (!room_id)
    return;
  var server_id = room_id.split('_')[0];
  var nick = room_id.split('_')[1];
  return _get_nick_whois_data(nick, server_id);
})

Handlebars.registerHelper('is_user_away', function (nick, server_name) {
  var server_id = (UserServers.findOne({name: server_name}, {_id: 1}) || {})._id || "";
  var whois_data = _get_nick_whois_data(nick, server_id);
  if (whois_data && whois_data.away)
    return true;
  return false;
});

Handlebars.registerHelper('current_server_id', function () {
  return Session.get('server_id');
});


Handlebars.registerHelper('current_server_away_msg', function () {
  var user_server =  UserServers.findOne({_id: Session.get('server_id')});
  if (user_server)
    return user_server.away_msg || "I'm not around.";
  return '';
});

function _submit_nick_away_data ($form) {
  var away_message = $form.find(
    '#nickAwayMessageInput').val() || "I'm not around.";
  var user_server = UserServers.findOne({_id: Session.get('server_id')});
  if (user_server)
    Meteor.call('mark_away', user_server.name, away_message, function (err) {
      console.log(err);
    });
}

Handlebars.registerHelper('isCurrentRoomtype', function (roomtype) {
  if (Session.get('roomtype') == roomtype)
    return true;
  return false;
})

Handlebars.registerHelper('showStatusIcon', function (status) {
  var iconClass = "";
  var statusIconHtml = '';
  if (status == 'connected')
    iconClass = 'glyphicon-ok-circle';
  else if (status == 'disconnected')
    iconClass = 'glyphicon-ban-circle';
  else if (status == 'connecting' || status == 'disconnecting')
    iconClass = 'spin glyphicon-refresh';
  if (iconClass) {
    statusIconHtml = '<icon class="tipsy-enable glyphicon ' + iconClass + '" tooltip="'
      + status + '"></icon>';
  }
  return new Handlebars.SafeString(statusIconHtml);
});

Handlebars.registerHelper('isConnected', function (status) {
  if (status == 'connected')
    return true;
  else
    return false;
});

Handlebars.registerHelper('showDatetime', function (datetime_obj) {
  var today_str = moment(new Date()).format('MM/DD/YYYY');
  if (today_str == moment(datetime_obj).format('MM/DD/YYYY'))
    return moment(datetime_obj).format('hh:mm A');
  else
    return moment(datetime_obj).format('hh:mm A, DD MMM\'YY');
});

Handlebars.registerHelper('isToday', function (date_obj) {
  if (moment(new Date()).format('MM/DD/YYYY') == moment(date_obj).format('MM/DD/YYYY'))
    return true;
  return false;
});

function infoPanelScrollendHandler (e) {
  var $target = $(e.target);
  if (Session.get('roomtype') == 'channel') {
    var channel = UserChannels.findOne({_id: Session.get('room_id')});
    if (!channel)
      return;
    var count = ChannelNicks.find(
        {channel_name: channel.name, server_name: channel.user_server_name}
      ).count();
    var startNick = Session.get(
        'startNick-' + channel.user_server_name + '_' + channel.name);
    if (count < 40 && (count < 30 && !startNick))
      return;
    $(document).off('scrollend.info_panel');
    var nth_channel_nick = ChannelNicks.findOne(
      {channel_name: channel.name, server_name: channel.user_server_name},
      {skip: 10, sort: {nick: 1}});
    var current_last_nick = Session.get(
      'currentLastNick-' + channel.user_server_name + '_' + channel.name);
    Session.set(
      'lastNick-' + channel.user_server_name + '_' + channel.name,
      nth_channel_nick.nick);
    Session.set(
      'startNick-' + channel.user_server_name + '_' + channel.name,
      null);
  }
  Meteor.setTimeout(function () {
    $(document).off('scrollend.info_panel')
    .on('scrollend.info_panel', '#info-panel .nano',
        infoPanelScrollendHandler);
  }, 2000);
}

$(document).on('scrollend.info_panel', '#info-panel .nano',
               infoPanelScrollendHandler);

function infoPanelScrolltopHandler (e) {
  var $target = $(e.target);
  if (Session.get('roomtype') == 'channel') {
    var channel = UserChannels.findOne({_id: Session.get('room_id')});
    if (!channel)
      return;
    if (ChannelNicks.find(
        {channel_name: channel.name, server_name: channel.user_server_name}
      ).count() < 40)
      return;
    $(document).off('scrolltop.info_panel');
    var nth_channel_nick = ChannelNicks.findOne(
      {channel_name: channel.name, server_name: channel.user_server_name},
      {skip: 10, sort: {nick: -1}});
    var current_last_nick = Session.get(
      'currentLastNick-' + channel.user_server_name + '_' + channel.name);
    var current_start_nick = Session.get(
      'currentStartNick-' + channel.user_server_name + '_' + channel.name);
    Session.set(
      'startNick-' + channel.user_server_name + '_' + channel.name,
      nth_channel_nick.nick);
    Session.set(
      'lastNick-' + channel.user_server_name + '_' + channel.name,
      null);
  }
  Meteor.setTimeout(function () {
    $(document).off('scrolltop.info_panel')
    .on('scrolltop.info_panel', '#info-panel .nano',
        infoPanelScrolltopHandler);
  }, 2000);
}

$(document).on('scrolltop.info_panel', '#info-panel .nano',
  infoPanelScrolltopHandler);

Handlebars.registerHelper('session', function (key) {
  return Session.get(key);
});

Handlebars.registerHelper('getCurrentChannel', function () {
  if (Session.get('roomtype') == 'channel') {
    return UserChannels.findOne({_id: Session.get('room_id')});
  }
});


function logRenders () {
    _.each(Template, function (template, name) {
      var oldRender = template.rendered;
      var counter = 0;
 
      template.rendered = function () {
        console.log(name, "render count: ", ++counter);
        oldRender && oldRender.apply(this, arguments);
      };
    });
  }

logRenders();