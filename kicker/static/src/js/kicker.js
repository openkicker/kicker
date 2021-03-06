odoo.define('kicker.app', function (require) {
"use strict";

var core = require('web.core');
var time = require('web.time');
var Widget = require('web.Widget');
var local_storage = require('web.local_storage');
var root = require('web_editor.root_widget');
var Router = require('kicker.router');
var rpc = require('web.rpc');
var _t = core._t;

require('web.dom_ready');

var Dashboard = Widget.extend({
    template: 'Dashboard',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    init: function () {
        this.chartData = {
            type: 'line',
            data: {
                labels: ['W1', 'W2', 'W3', 'W4', 'W5'],
                datasets: [{
                    label: 'Win/Loss Ratio',
                    data: [1,1,1,1,1],
                }]
            },
            options: {
                scales: {
                    yAxes: [{
                        ticks: {
                            min: 0,
                            max: 100,
                        }
                    }]
                }
            }
        };
        this.ratioData = {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: [
                        '#161E6D',
                        'rgba(255,255,255,0)',
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                tooltips: {
                    enabled: false,
                },
            }
        };
    },
    start: function () {
        var self = this;
        return $.when(
            rpc.query({
                route: '/app/json/dashboard',
            }),
            this._super.apply(this, arguments)
        )
            .then(function(data) {
                self.wins = data.wins;
                self.losses = data.losses;
                self.teammates = data.teammates;
                self.nightmares = data.nightmares;
                self.chartData.data.datasets[0].data = data.graph;
                self.ratioData.data.datasets[0].data = [data.ratio, 100-data.ratio];
                self.name = data.name;
                self.renderElement();            
            });
    },
    renderElement: function () {
        var result = this._super.apply(this, arguments);
        new Chart(this.$('#o_kicker_main_chart')[0].getContext('2d'), this.chartData);
        new Chart(this.$('#o_kicker_ratio_chart')[0].getContext('2d'), this.ratioData)
        return result;
    }    
});

var Profile = Widget.extend({
    template: 'Profile',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    events: {
        'click .o_kicker_edit': '_toggleEdit',
        'click .o_kicker_save': '_onSave',
        'click .o_kicker_profile_img_select': '_onSelectImg',
        'click .o_kicker_profile_img_reset': '_onResetImg',
        'change .o_kicker_file_upload': '_onImgChange',
    },
    init: function (parents, options) {
        this._super.apply(this, arguments);
        this.player = undefined;
        this.editable = true;
        this.edit = false;
    },
    start: function() {
        var self = this;
        return $.when(
            rpc.query({
                route: '/app/json/player/'
            }),
            rpc.query({
                route: '/app/json/kickers',
            }),
            this._super.apply(this, arguments)
        )
        .then(function (player_data, kickers) {
            self.player = player_data;
            self.kickers = kickers.kickers;
            self.default_kicker = kickers.default;
            self.renderElement();
        });
    },
    _toggleEdit: function (e) {
        this.edit = !this.edit;
        this.renderElement();   
    },
    _onSave: function (ev) {
        function readFile(file, params) {
            var reader = new FileReader();
            var deferred = $.Deferred();
        
            reader.onload = function(event) {
                deferred.resolve(params['avatar'] = event.target.result.split(',')[1]);
            };
            reader.onerror = function() {
                deferred.reject(this);
            };
            if (file) {
                reader.readAsDataURL(file);
            } else {
                deferred.resolve();
            }
            return deferred.promise();
        }
        var self = this;
        var $btn = $(ev.target);
        $btn.prop('disabled', true);
        $btn.prepend('<i class="fa fa-spin fa-circle-o-notch"/>&nbsp;')
        var $form = $(ev.target).closest('form');        
        var formArray = $form.serializeArray();
        var params = {};
        ev.preventDefault();
        for (var i = 0; i < formArray.length; i++){
            params[formArray[i]['name']] = formArray[i]['value'];
        }
        var files = $form.find('input[type="file"]')[0].files;
        return readFile(files[0], params)
        .then(function () {
            return rpc.query({
            route: '/app/json/update_profile',
            params: params
        })})
        .then(function (result) {
            if (result.errors) {
                console.log(result.errors);
            } else if (result.success) {
                self.edit = false;
                self.player = result.player;
                self.renderElement();
                self.trigger_up('profileChange', {'player': result.player});
            }
            return result;
        }).fail(function (type, error) {
            console.log(error.data.arguments);
            return type, error;
        });
    },
    _onSelectImg: function (ev) {
        ev.preventDefault();
        $(ev.target).closest('form').find('.o_kicker_file_upload').trigger('click');
        $(ev.target).closest('form').find('.o_kicker_profile_img_select').addClass('o_kicker_profile_img_reset').removeClass('o_kicker_profile_img_select');
    },
    _onImgChange: function (ev) {
        if (ev.target.files.length) {
            var $form = $(ev.target).closest('form');
            var reader = new window.FileReader();
            reader.onload = function(ev) {
                var $img = $form.find('.o_kicker_profile_img');
                $img.attr('data-init-src', $img.attr('src'));
                $img.attr('src', ev.target.result);
            };
            reader.readAsDataURL(ev.target.files[0]);
            //$form.find('#forum_clear_image').remove();
        }
    },
    _onResetImg: function (ev) {
        var $form = $(ev.target).closest('form');
        var $img = $form.find('.o_kicker_profile_img');
        $form.find('.o_kicker_profile_img').attr("src", $img.attr('data-init-src'));
        $(ev.target).closest('form').find('.o_kicker_profile_img_reset').addClass('o_kicker_profile_img_select').removeClass('o_kicker_profile_img_reset');
    },
});

var Rankings = Widget.extend({
    template: 'Rankings',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    events: {
        'click .o_ranking_period label': '_changePeriod',
        'sort.bs.table table': '_onSort',
    },
    init: function() {
        this._super.apply(this, arguments);
        this.period = 'month';
        this.loaded = false;
        this.reverse_rank = false;
        this.data = false;
    },
    start: function () {
        var self = this;
        return $.when(
            this._queryData(),
            this._super.apply(this, arguments)
        )
            .then(function(data) {
                self._renderData(data)
            });
    },
    _renderData: function(data) {
        var self = this;
        if (this.loaded) {
            this.$('table[data-toggle="table"]').bootstrapTable('load', this.data);
        } else {
            this.$('table[data-toggle="table"]').bootstrapTable({
                sortName: 'won',
                sortOrder: 'desc',
                classes: 'table table-borderless table-hover table-sm',
                columns: [{
                    field: 'rank',
                    title: '#',
                    formatter: function(v,r,i) {return self.reverse_rank?self.data.length-i:i+1;},
                }, {
                    field: 'name',
                    title: 'Player',
                    formatter: this._nameFormatter,
                }, {
                    field: 'won',
                    title: 'Won',
                    sortable: true,
                }, {
                    field: 'lost',
                    title: 'Lost',
                    sortable: true,
                }, {
                    field: 'matches',
                    title: 'Matches',
                    sortable: true,
                }],
                data: this.data,
            });
            this.loaded = true;
        }
    },
    _nameFormatter: function(value, row, index) {
        // shitty string literal instead of qweb but well ¯\_(ツ)_/¯
        return `<a href="/app/community/player/${row.id}" data-router="true">${value}</a>`;
    },
    _queryData: function() {
        var self=this;
        return rpc.query({
            route: '/app/json/rankings',
            params: {"period": this.period},
        }).then(function(data) {
            self.data = data;
        });
    },
    _onSort: function(e, field, order) {
        if (order === 'asc') {
            this.reverse_rank = field!=='lost';
        } else {
            this.reverse_rank = field==='lost';
        }
    },
    _changePeriod: function(ev) {
        ev.preventDefault();
        var $e = $(ev.target);
        $e.parent().find('label.active').removeClass('active');
        $e.addClass('active');
        this.period = $e.find('input').attr('value');
        var self = this;
        return this._queryData().then(function(data) {
            self._renderData(data);
        })
    }
});

var Community = Widget.extend({
    template: 'Community',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    start: function () {
        var self = this;
        return $.when(
            rpc.query({
                route: '/app/json/community',
            }),
            this._super.apply(this, arguments)
        )
            .then(function(data) {
                self.usual = data.usual;
                self.rare = data.rare;
                self.renderElement();            
            });
    },
});



var About = Widget.extend({
    template: 'About',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
});

var Offline = Widget.extend({
    template: 'Offline',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
});

var AddScore = Widget.extend({
    template: 'AddScore',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    events: {
        'submit form.o_kicker_score': '_onSubmit',
    },
    start: function () {
        var self = this;
        return $.when(
            rpc.query({
                route: '/app/json/players',
            }),
            rpc.query({
                route: '/app/json/kickers',
            }),
            this._super.apply(this, arguments)
        )
            .then(function(players, kickers) {
                self.players = players;
                self.kickers = kickers.kickers;
                self.default_kicker = kickers.default;
                self.renderElement();     
                self.$('select.form-control').select2();       
            });
    },
    _onSubmit: function (ev) {
        ev.preventDefault();
        var self = this;
        var $form = $(ev.target).closest('form');
        var formArray = $form.serializeArray();
        var params = {};
        for (var i = 0; i < formArray.length; i++){
            params[formArray[i]['name']] = formArray[i]['value'];
        }
        return rpc.query({
            route: '/kicker/score/submit',
            params: params
        }).then(function (result) {
            if (result.errors) {
                console.log(result.errors);
            } else if (result.success) {
                Router.navigate('/app/dashboard');
            }
            return result;
        }).fail(function (type, error) {
            self._updateStatus($panel, 'failed', error.data.arguments);
            return type, error;
        });
    },
});

var CommunityProfile = Widget.extend({
    template: 'CommunityProfile',
    xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
    init: function (parents, options) {
        this._super.apply(this, arguments);
        this.player_id = options.player_id;
        this.player = undefined;
        this.editable = false ;
    },
    willStart: function() {
        var self = this;
        return rpc.query({
            route: '/app/json/player/' + this.player_id
        })
        .then(function (player_data) {
            self.player = player_data;
        });
    },
});

var App = Widget.extend({
  xmlDependencies: ['/app/static/src/xml/kicker_templates.xml'],
  events: {
    'click #burger-toggle, .overlay': '_toggleMenu',
    "swipeleft .overlay, #sidebar, #top-header": function (ev) {this._toggleMenu(ev, 'close');},
    'swiperight #top-header, .o_kicker_main':  function (ev) {this._toggleMenu(ev, 'open');},
    'click a[data-router]': '_onMenuClick',
  },
  custom_events: {
      'profileChange': '_onProfileChange',
  },
  pages: {
      dashboard: Dashboard,
      profile: Profile,
      community: Community,
      rankings: Rankings,
      about: About,
      offline: Offline,
      communityProfile: CommunityProfile,
      score: AddScore,
  },
  init: function (parent, options) {
      this._super.apply(this, arguments);
      var self = this;
      Router.config({mode: 'history'});

      // adding routes (most specific to less specific)
      Router
      .add(/dahboard/, function () {
          self._switchPage('dashboard');
      })
      .add(/profile/, function () {
          self._switchPage('profile');
      })
      .add(/rankings/, function () {
        self._switchPage('rankings');
    })
      .add(/community\/player\/(.*)/, function (player_id) {
          self._switchPage('communityProfile', {player_id: player_id});
      })
      .add(/community/, function () {
          self._switchPage('community');
      })
      .add(/score/, function() {
        self._switchPage('score');
      })
      .add(/about/, function() {
        self._switchPage('about');
      })
      .add(/offline/, function() {
        self._switchPage('offline');
      })
      .add(function () {
          self._switchPage('dashboard');
      })
      .listen();
  },
  willStart: function () {
    Router.check();
    return this._super.apply(this, arguments);
  },
  start: function () {
      this.$('[data-toggle="popover"]').popover({
          placement: 'top',
           trigger: 'click focus',
          container: 'body',
      });
  },
  _toggleMenu: function (ev, force) {
    if (force === 'open') {
        this.$('#sidebar').addClass('active');
        this.$('.overlay').fadeIn();

    } else if (force === 'close') {
        this.$('#sidebar').removeClass('active');
        this.$('.overlay').fadeOut();

    } else {
        this.$('#sidebar').toggleClass('active');
        this.$('.overlay').fadeToggle();
    }
  },  
  _onMenuClick: function (ev) {
      ev.preventDefault();
      var link = $(ev.target).closest('a');
      if (link.length > 0) {
          
          var path = link[0].pathname;
          if (!navigator.onLine)
            path = '/app/offline';
          Router.navigate(path);
      }
      this._toggleMenu({}, 'close');
  },
  _switchPage: function (target, options) {
      var pageConstructor = this.pages[target];
      if (!(this.content instanceof pageConstructor)) {
          this.content = new pageConstructor(this, options);
          this.content.replace(this.$('.o_kicker_main'));
      }
      this._toggleMenu({}, 'close');
  },
  _onProfileChange: function (e) {
    // small trick to refresh the avatar without refreshing the page: prevent
    // getting if from cache by adding an arbitrary GET param
    var $img = this.$el.find('.o_kicker_profile_image');
    $img.attr('src', $img.attr('src') + '?t=' + new Date().getTime());
    this.$el.find('.user_name').text(e.data.player.name);
  },
});

var app = new App(root);
var el = $('.o_kicker_app');
app.attachTo(el);

// Register serviceworker if applicable
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/app/sw.js').then(function(registration) {
      // Registration was successful
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      // registration failed :(
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}
// Display "offline" indicator when connectivity is lost
window.addEventListener('load', function(event) {
  function updateOnlineStatus(event) {
    if (!navigator.onLine) {
        Router.navigate('/app/offline');
    } else {        
        Router.navigate('/app/dashboard');
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});


});
