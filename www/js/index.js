/*
 * 离线笑话
 * 作者：任侠 http://lzw.me
 * 联系：l@lzw.me
 * 日期：2014-05-18
 * 更新：2014-05-30
 * 版本：0.0.1
 */

/* websql 操作类*/
var DBConn = function (config) {
    var dbObj = null;
    var config = $.extend({
        dbName: 'lzwmejoke',        //数据库名
        version: '1.0',             //版本信息
        description: 'lzwmejoke',   //描述
        maxSize: 50 * 1024 * 1024    //数据库最大值
    },config);

    //打开数据库
    function openDB() {
        try {
            if (!dbObj) {
                dbObj = window.openDatabase(config.dbName, config.version, config.description, config.maxSize);
            }
        } catch (e) {
            alert("打开数据库出现未知错误： " + e);
            dbObj = null;
        }
        return dbObj;
    }

    this.getDBconn = function () {
        return openDB();
    };

    this.executeSqlDefault = function (sqlStr, params, successHandler, errorHandler) {
        openDB();
        dbObj.transaction(function (tx) {
            tx.executeSql(sqlStr, params, successHandler, errorHandler);
        }, null, null);
    };

    this.executeSqlTrans = function (fun, successHandler, errorHandler) {
        openDB();
        dbObj.transaction(fun, errorHandler, successHandler);
    };

    //修改数据库版本信息
    this.changeDBVersion = function (oldVersion, newVersion, errorFun) {
        dbObj = openDB();
        dbObj.changeVersion(oldVersion, newVersion, null, errorFun, null);
    };

    //判断某表是否存在：表名、存在回调函数、不存在回调函数
    this.isExitTable = function (tableName, exitFun, noexitFun) {
        dbObj = openDB();
        var sql = "select * from sqlite_master where type='table' and name = ?";
        dbObj.transaction(function (tx) {
            tx.executeSql(sql, [tableName], function (transaction, result) {
                if (result.rows.length > 0 && exitFun) {
                    exitFun.call();
                } else if (result.rows.length <= 0 && noexitFun) {
                    noexitFun.call();
                }
            }, null);
        });

    };

    //删除表数据：表名，删除成功回调函数
    this.delTableData = function (tableName, successHandler, errorHandler) {
        dbObj = openDB();
        dbObj.transaction(function (tx) {
            tx.executeSql('delete from ?'[tableName]);
            tx.executeSql('update sqlite_sequence set seq=0 where name=?',[tableName]);
        },errorHandler, successHandler);
    };

    //删除表，删除成功回调函数
    this.dropTable = function (tableName, callBackFun) {
        dbObj = openDB();
        var sql = "drop table ?";
        dbObj.transaction(function (tx) {
            tx.executeSql(sql, [tableName], successHandler, errorHandler);
        });
    };
};

/**控制器**/
var appController = {
    dbcon: new DBConn(),    //数据库操作类
    totalCount: 0, //笑话总数目
    pagesize: 10, //每页显示条数
    requestUrl: './',//'http://lzw.me/pages/lxxh/',//服务器请求地址
    articeTableName: 'article',
    prefix: '', //
    //初始化
    init:function(){
        var _this = this;
        //缓存笑话总数
        this.totalCount = this.getCount();

        //访问内容：单击链接访问内容
        $(document).on('click', 'a['+ this.prefix +'aid]',function(){
            //appController.getOneJoke($(this).attr('aid'));
            appSetting.setProcessing($(this).attr(_this.prefix +'aid'));
        });

        //单击笑话列表上一页/下一页链接访问列表
        $(document).on('click', 'a['+ this.prefix +'pid]',function(){
            _this.getList($(this).attr(_this.prefix +'pid'),($(this).attr('pz') || _this.pagesize) );
        });

        //单击笑话列表按钮：访问列表
        $(document).on('click', '.gotolist', function(event){
            app.storage.getItem('latestaid',function(aid){
                if (!aid) {aid = 0};
                _this.getList(Math.ceil(aid/_this.pagesize), _this.pagesize,function(){
                    //回调，高亮上次阅读行
                    $('#resultList li a:eq('+ (aid % _this.pagesize -1) +')').addClass('ui-btn-active');
                });
            });
        });

        //单击赞和踩时动作
        $(document).on('click', '#dingBtn', function(action){
            var aid = parseInt($("#"+_this.prefix +"jk_prev").attr(_this.prefix +'aid')) + 1;
            if (!aid) { app.tips('页面错误！');return;};
            var sql = "SELECT hits FROM " + _this.articeTableName + " WHERE id=? LIMIT 1";
            _this.dbcon.executeSqlDefault(sql,[aid],function(tx, rs){
                var hits = rs.rows.item(0).hits + 1;
                sql = "UPDATE " + _this.articeTableName + " SET hits=? WHERE id=?";
                _this.dbcon.executeSqlDefault(sql, [hits, aid], function(){
                    app.tips('赞：' + hits);
                },function(rs,err){
                    console.log('update hits err:',err);
                });
            }, function(rs,err){
                    console.log('SELECT hits err:',err);
                });
        });
        $(document).on('click', '#caiBtn', function(){
            var aid = parseInt($("#"+_this.prefix +"jk_prev").attr(_this.prefix +'aid')) + 1;
            if (!aid) { app.tips('页面错误！');return;};

            var sql = "SELECT hits FROM " + _this.articeTableName + " WHERE id=? LIMIT 1";
            _this.dbcon.executeSqlDefault(sql,[aid],function(tx, rs){
                var hits = rs.rows.item(0).hits - 1;
                sql = "UPDATE " + _this.articeTableName + " SET hits=? WHERE id=?";
                _this.dbcon.executeSqlDefault(sql, [hits, aid], function(){
                    app.tips('不好你就踩：' + hits);
                });
            });
        });
    },
    //删除表
    dropTables: function(){
        this.dbcon.executeSqlTrans(function(tx){
            tx.executeSql('DROP TABLE IF EXISTS article');
            tx.executeSql('DROP TABLE IF EXISTS user_article');
            tx.executeSql('DROP TABLE IF EXISTS favorite');
            tx.executeSql('DROP TABLE IF EXISTS config');
        },function(){
            app.tips("删除表成功");
        });
    },
    //初始化数据库
    initdatabase: function(dataname, type){

        appController.dropTables(); //首先删除表
        app.storage.clear();    //清除本地存储
        this.dbcon.executeSqlTrans(function(tx){
            console.log('创建表开始：', tx);

            tx.executeSql(
                ['CREATE TABLE IF NOT EXISTS article(', //文章表
                'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,',
                'remoteid INTEGER NOT NULL default 0,', //远程服务器对应ID
                'title text,content text,datetime,',    //标题、内容、添加时间
                'author,',                              //作者
                'hits default 0,',                       //赞次数
                'hitstoremote default 0',               //上次发送到服务器的赞次数
                ')'].join("")
            );

            tx.executeSql(
                ['CREATE TABLE IF NOT EXISTS user_article(', //用户添加文章表
                'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,',
                'title text,content text,datetime,',    //标题、内容、添加时间
                'author,',                              //作者
                'send default 0,',                      //如为用户增加内容，则是否已发送到服务器
                'hits default 0',                       //赞次数
                ')'].join("")
            );

            tx.executeSql(
                ['CREATE TABLE IF NOT EXISTS favorite(',    //收藏表
                    'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,',
                    'aid, datetime',    //文章ID，文章标题，添加时间
                    ')'].join("")
            );
            tx.executeSql(
                ['CREATE TABLE IF NOT EXISTS config(',  //系统配置表
                    'c_key NOT NULL PRIMARY KEY ,',     //名称
                    'c_value',                          //内容
                    ')'].join("")
                );
            //tx.executeSql('CREATE TABLE IF NOT EXISTS user(id unique, name, pwd, tel, datetime)');
        },function(){
            appController.datainit(dataname, type); //执行成功，则开始导入数据
        },
        function(err){
            appController.errorFun("数据初始化失败：" + err);
            console.log(err);
        });
    },
    //初始化数据，从data.json文件导入：数据名称、请求数据方式（普通、ajax、jsonp）、是否清空表
    datainit: function(dataname, type, truncateTable){
        console.log('开始加载数据');
        //数据参数存在，则直接调用 loaddata
        // if (data && data.article) {
        //     appController.loadData(data);
        // };

        //是否清空 article 表
        if (truncateTable == true) {
            this.dbcon.delTableData('article');
        };
        
        app.tips('开始请求数据...','always','loading');
        //非ajax方式
        if (!type) {
            app.util.addScript(dataname || 'data/data.json');
            return;
        };

        //ajax 方式
        var options = {
            type: 'GET',
            url: appController.requestUrl + (dataname || "data/data.json"),
            timeout: 120000
        };

        //ajax , 是否为jsonp方式
        if (type == 'jsonp') {
            options.dataType='jsonp';
            options.jsonp="callback";
          
        };
        $.ajax(options).done(function(data){
            console.log(data);
            appController.loadData(data);
        }).fail(function(jqXHR, textStatus ){
            console.log('数据请求失败！',jqXHR, textStatus );
            app.tips('数据请求失败！'+ textStatus + jqXHR.statusText);
            app.storage.setItem('datainit','0');
        }).always(function(){
            //app.tips('数据请求完成！');
        });
    },
    /**
    * 批量加载数据
    *
    * data 格式：
    * {article:[{'title':'','content':'','author':''...},{}...], favorite:[]...}
    */
    loadData: function(data, truncateTable){
        console.log('load',data);
        if (!data) {
            console.log('数据为空，不加载数据');
            return;
        };
        /**
        *导入笑话内容
        */
        if(data.article){
            var sql, len, total;
            app.tips("开始初始化数据，请耐心等待",'always','loading');
            console.log(data.article);
            total = len = data.article.length;
            sql = 'INSERT INTO article (remoteid, title, content, datetime, author, hits)VALUES(?, ?, ?, ?, ?, ?)';
            //批量加载数据
            this.dbcon.executeSqlTrans(function(tx){
                for (var i=0;i<len;i++){
                    if (!data.article[i].title ||!data.article[i].content ) {
                        total--;
                        continue;
                    };//标题和内容必须存在
                    tx.executeSql(sql,
                        [(data.article[i].remoteid || 0),data.article[i].title, data.article[i].content, (data.article[i].datetime || (new Date().getTime())), (data.article[i].author || ''), (data.article[i].hits||0)]
                    );
                }
            },function(){
                //标记初始化成功
                app.storage.setItem('datainit','1');
                app.tips("更新完成，成功添加了" + total + "条数据", 3000, 'text',function(){
                    if (data.nextdataname) {
                        app.tips('3秒钟后继续将请求下一数据包：'+data.nextdataname,3000,'loading', function(){
                            appController.datainit(data.nextdataname);
                        });
                    }else{
                        window.location.reload();
                    }
                });
            },function(err){
                app.tips('数据更新失败：' + err.message);
                console.log(err);
            });
            //批量加载数据结束
        };
        //导入设置内容
        if(data.config){

        };
    },
    //获取一条笑话，显示到页面
    getOneJoke: function(id, successFun, errorFun){
        var id =parseInt(id);
        var _this = this;
        if (!id) {
            this.errorFun('没有了');
            return;
        };
        var sql = 'SELECT id,title,content FROM '+ this.articeTableName +' WHERE id=? LIMIT 1';
        this.dbcon.executeSqlDefault(sql,[id],function(tx,result){
            console.log('读取到了一条笑话',result,result.rows.item);
            if($.isFunction(successFun)) return successFun.call(_this, tx, result);
            if (!result.rows.length) {
                app.tips('没有数据了');
                console.log('没有了');
                return;
            };
            //设置页面内容
            var rs = result.rows.item(0);
            $('#' + _this.prefix + 'jk_title').html(rs.title);
            $('#' + _this.prefix + 'jk_content').html(rs.content);
            if( _this.totalCount){//已经读取到了总数，才显示进度
                $('#' + _this.prefix + 'content_process').text(id + "/" + _this.totalCount);
            }
            //系统笑话的处理
            if (_this.prefix == appController.prefix) {
                appFav.checkIsFav(id);  //收藏按钮的处理
                window.localStorage.setItem('latestaid',id);//增加到缓存，用于下次刷新时检测
            };
            window.location.hash= _this.prefix+'content';

            //获取上一条的ID
            var sql = 'select id from '+ _this.articeTableName +' where id<? order by id desc limit 1';
            appController.dbcon.executeSqlDefault(sql, [id], function(tx,result){
                console.log('读取到了上一条笑话ID',result, result.rows.item);  
                if (!result.rows.length) {
                    $('#' + _this.prefix + 'jk_prev').attr(_this.prefix + 'aid', 0);
                }else{
                    $('#' + _this.prefix + 'jk_prev').attr(_this.prefix + 'aid',result.rows.item(0).id);
                }
            });
            //下一条的ID
            var sql = 'select id from '+ _this.articeTableName +' where id>? limit 1';
            appController.dbcon.executeSqlDefault(sql, [id], function(tx,result){
                console.log('读取到了下一条笑话ID',result, result.rows.item);  
                if (!result.rows.length) {
                    $('#' + _this.prefix + 'jk_next').attr(_this.prefix + 'aid', 0);
                }else{
                    $('#' + _this.prefix + 'jk_next').attr(_this.prefix + 'aid',result.rows.item(0).id);
                }
            });
        }, function(err){
            if($.isFunction(successFun)) return successFun.call(appController, err);
            app.tips('读取错误：'+err.message);
        });
    }, 
    //获取列表，显示到页面
    getList: function(page, pagesize,successFun,errorFun){
        var sql = 'select * from '+ this.articeTableName +' limit ?,?';
        var pagesize = parseInt(pagesize) || this.pagesize;
        var page = parseInt(page);
        if (page == 'NaN') {page = 1};
        if (page <=0) {
            this.errorFun('已到第一页');
            return;
        };
        this.dbcon.executeSqlDefault(sql,[pagesize*(page-1),pagesize], $.proxy(function(tx, result){
            var len,html;
            len = result.rows.length;
            console.log('读取列表数据', result);
            if (len == 0) {
                console.log('没有了', page, pagesize);
                app.tips('没有了');
                return;
            };

            html = ['<ul data-role="listview" data-inset="true">']; 
            for (var i=0; i<len; i++){  
                var rs = result.rows.item(i);
                html.push('<li><a '+ this.prefix +'aid="'+rs.id+'" href="#">'+rs.title+'</a>');
                if (this.prefix == 'useradd_') {
                    html.push('<a href="#" '+ this.prefix +'eaid="'+rs.id+'" data-theme="b" data-icon="edit" data-transition="pop">修改</a></li>');
                };
            }
            html.push('</ul>');
            $('#' + this.prefix + 'resultList').html($(html.join(''))).find('ul').listview();
            $('#' + this.prefix + 'page_prev').attr(this.prefix + 'pid', page-1).attr('pz', pagesize);
            $('#' + this.prefix + 'page_next').attr(this.prefix + 'pid', page+1).attr('pz', pagesize);
            $('#' + this.prefix + 'page_end').attr(this.prefix + 'pid', Math.ceil(this.totalCount/pagesize)).attr('pz', pagesize);
            $('#' + this.prefix + 'list_process').text(page+"/" + Math.ceil(this.totalCount/pagesize));//进度
            
            if($.isFunction(successFun)) return successFun.call(this,result);
            $( ":mobile-pagecontainer" ).pagecontainer( "change", '#' + this.prefix + 'list');
        }, this),$.proxy(function(tx,err){
            console.log(tx,err);
            app.tips('没有数据了');
            if($.isFunction(errorFun)) return errorFun.call(this, err);
        },this));
    },
    //获取笑话总数
    getCount: function(){
        if (!this.totalCount) {
            var sql = 'select count(*) as count from '+this.articeTableName;
            this.dbcon.executeSqlDefault(sql, [], $.proxy(function(tx, result) {
                this.totalCount = result.rows.item(0).count;
            },this));
        }else{
            return this.totalCount;
        }
    },
    errorFun: function(msg){
        app.tips(msg);
    }
};
/**
 * 用户增加内容控制
 */
var appUserAdd = $.extend({}, appController, {
    totalCount: 0,
    articeTableName: 'user_article',
    prefix: 'useradd_',  //前缀操作
    init: function(){
        var _this = this;
        this.totalCount = this.getCount();
        //访问内容：单击链接访问内容
        $(document).on('click', 'a['+ this.prefix +'aid]',function(){
            _this.getOneJoke($(this).attr(_this.prefix +'aid'));
            //appSetting.setProcessing($(this).attr('aid'));
        });

        //单击笑话列表上一页/下一页链接访问列表
        $(document).on('click', 'a['+ this.prefix +'pid]',function(){
            _this.getList($(this).attr(_this.prefix +'pid'), ($(this).attr('pz') || _this.pagesize) );
        });

        //修改笑话：单击修改我的笑话按钮链接时访问内容
        $(document).on('click', 'a['+ this.prefix +'eaid]',function(){
            _this.getOneJoke($(this).attr(''+ _this.prefix +'eaid'),function(tx,result){
                if (result.rows.length==0) {app.tips('内容错误，该文章已不存在！')};
                var rs = result.rows.item(0);
                console.log(rs);
                $('#editJoke_id').val(rs.id);
                $('#editJoke_title').val(rs.title);
                $('#editJoke_content').val(rs.content);
                $( ":mobile-pagecontainer" ).pagecontainer( "change", "#editJoke");
            });
        });

        //单击添加按钮时增加自定义数据
        $(document).on('click', '#addJokeBtn', $.proxy(function(){
            var title = $("#addJoke #addJoke_title").val();
            var content = $("#addJoke #addJoke_content").val();
            if (!title || title.length<2 || title.length>50) {app.tips("标题长度应在2-50之间");return};
            if (!content || content.length<10  || content.length>500) {app.tips("内容长度应在10-300之间");return};
            var data = [{
                'title': title,
                'content': content,
                'author' : 'local',
                'useradd': 1
            }];
            this.addJoke(data, function(){
                app.tips("添加成功！");
                $("#addJoke #addJoke_title").val('');
                $("#addJoke #addJoke_content").val('');
            },function(){
                app.tips("添加失败！");
            });
        }, this));

        //单击修改按钮时增加自定义数据
        $(document).on('click', '#editJokeBtn', $.proxy(function(){
            var id = parseInt($("#editJoke #editJoke_id").val());
            var title = $("#editJoke #editJoke_title").val();
            var content = $("#editJoke #editJoke_content").val();
            if (!id) {app.tips('参数丢失，修改失败！');return;};
            if (!title || title.length<2 || title.length>50) {app.tips("标题长度应在2-50之间");return};
            if (!content || content.length<10  || content.length>500) {app.tips("内容长度应在10-300之间");return};
            var data = [{
                'id' :id,
                'title': title,
                'content': content,
                'author' : 'local',
                'useradd': 1
            }];
            this.editJoke(data, function(){
                $("#editJoke #editJoke_id").val('');
                $("#editJoke #editJoke_title").val('');
                $("#editJoke #editJoke_content").val('');
                app.tips("修改成功！",1000, 'text', $.proxy(function(){
                    console.log('aaa');
                    _this.getList(Math.ceil(id/10),10); 
                }, this));
            },function(){
                app.tips("修改失败！");
            });
        }, this));
    },
    //增加一条笑话
    // data 格式：[{'title':'','content':'','author':''...},...]
    addJoke: function(data, successFun, errorFun){
        var sql, len, total;
        if (!data || !data.length) {
            console.log('增加笑话失败，数据内容或标题为空', data);
            app.tips('增加笑话失败，内容格式错误');
            return;
        };

        total = len = data.length;
        sql = 'INSERT INTO '+ this.articeTableName +' (title, content, datetime, author, send, hits)VALUES(?, ?, ?, ?, ?, ?)';

        console.log(data);
        //批量加载数据
        this.dbcon.executeSqlTrans(function(tx){
            for (var i=0;i<len;i++){
                if (!data[i].title ||!data[i].content ) {
                    total--;
                    continue;
                };//标题和内容必须存在
                tx.executeSql(sql,
                    [data[i].title, data[i].content, (data[i].datetime || (new Date().getTime())), (data[i].author || ''), (data[i].send || 0), (data[i].hits||0)]
                );
            }
            },$.proxy(function(tx,result){
                this.totalCount += len;//调整总数
                //$('#setProcessing').attr('max', appController.totalCount);//进度控制
                app.tips("成功添加了" + total + "条数据", 3000, 'text');
                len = null;total=null;sql=null;
                if ($.isFunction(successFun)) {successFun.call(this,result);};
            },this), 
            $.proxy(function(err){
                console.log('add failed',err);
                app.tips('数据增加失败：' + err.message);
                if ($.isFunction(errorFun)) {errorFun.call(this,err);};
            },this)
        ); //批量加载数据结束
    },
    /**
    * 修改笑话
    */
    editJoke: function(data, successFun, errorFun){
        if (!data || !data.length) {
            console.log('修改笑话失败：', data);
            app.tips('修改笑话失败，内容格式错误');
            return;
        };

        var total = len = data.length;
        var sql = ' REPLACE INTO '+ this.articeTableName +' (id, title, content, datetime, author, send, hits)VALUES(?, ?, ?, ?, ?, ?, ?)';
        var _this = this;
        console.log(data);
        //批量修改数据
        this.dbcon.executeSqlTrans(function(tx){
                for (var i=0;i<len;i++){
                    if (!data[i].title ||!data[i].content ) {
                        app.tips('一条数据格式不符，修改失败');
                        total--;
                        continue;
                    };//标题和内容必须存在
                    tx.executeSql(sql,
                        [(data[i].id||0), data[i].title, data[i].content, (data[i].datetime || (new Date().getTime())), (data[i].author || ''), (data[i].send || 0), (data[i].hits||0)]
                    );
                }
            },function(tx,rs){
                app.tips("成功修改了" + total + "条数据", 3000, 'text');
                if ($.isFunction(successFun)) {successFun.call(_this,rs);};
            }, 
            function(err){
                console.log(err);
                app.tips('数据修改失败：' + err.message);
                if ($.isFunction(errorFun)) {errorFun.call(_this,err);};
            }
        );
        //批量修改数据结束
    }
});
/**收藏**/
var appFav = $.extend({}, appController, {
    prefix: 'fav_',
    articeTableName: 'favorite',
    init: function(){
        //缓存笑话总数
        this.totalCount = this.getCount();

        //收藏按钮被点击时的处理
        $(document).on('click', '#addToFavBtn', function(event) {
            event.preventDefault();
            //如果已经收藏
            var aid = parseInt($("#jk_prev").attr('aid')) + 1;
            if (!aid) { app.tips('页面错误！');return;};
            if ($(this).hasClass('ui-btn-active') && $(this).text('消')) {
                appFav.delFav(aid);
            }else if($(this).text('藏')){
                appFav.addtoFav(aid);
            }
        });

        //单击收藏列表的上一页/下一页链接访问列表
        $(document).on('click', 'a[fav_pid]',function(){
            appFav.getFavList($(this).attr('fav_pid'), ($(this).attr('pz') || appController.pagesize) );
        });
    },
    /**
     * 检测是否已收藏，对收藏按钮作处理
     * @param  {[type]} aid [description]
     * @return {[type]}     [description]
     */
    checkIsFav: function(aid){
        var aid = parseInt(aid);
        if (!aid) {
            app.tips('页面错误！');
            return;
        };
        appController.dbcon.executeSqlDefault('SELECT * FROM favorite where aid=? LIMIT 1',[aid],function(tx,result){
            if (result.rows.length>0) {
                $('#addToFavBtn').addClass('ui-btn-active').text('消');
            }else{
                $('#addToFavBtn').removeClass('ui-btn-active').text('藏');
            };
        });

    },
    //收藏
    addtoFav: function(aid, title){
        var aid = parseInt(aid);
        if(!aid){
            this.errorFun('未知错误，收藏失败！');
            console.log('收藏失败，aid不能为空！');
            return false;
        };
        appController.dbcon.executeSqlDefault('SELECT id FROM favorite where aid=? limit 1',[aid], function(tx,result){
            if (result.rows.length>0) {
                app.tips('已经收藏过了！');
                return false;
            };
            appController.dbcon.executeSqlDefault('INSERT INTO favorite (aid, datetime)VALUES(?,?)',
                [aid,(new Date()).getTime()],function(tx){
                    $('#addToFavBtn').addClass('ui-btn-active').text('消');
                    app.tips('收藏成功！');
                    appFav.totalCount +=1;
                }, function(tx,result){
                    app.tips('收藏失败：'+result.message);
                });
        }, this.errorFun);
    },

    //取消
    delFav: function(aid){
        var aid = parseInt(aid);
        if(!aid){
            this.errorFun('未知错误，取消失败！');
            console.log('收藏失败，aid不能为空！');
            return false;
        };
        this.dbcon.executeSqlDefault('delete FROM favorite where aid=?',[aid], function(tx,result){
            $('#addToFavBtn').removeClass('ui-btn-active').text('藏');
            app.tips('取消收藏成功！');
            appFav.totalCount -= 1;
        }, function(tx,err){
            app.tips('取消失败：'+ err.message);
            console.log(err);
        });

    },

    //获取收藏列表
    getFavList: function(page, pagesize){
        var sql = 'SELECT id,title FROM article WHERE id in (SELECT aid FROM favorite LIMIT ?,?)';

        var pagesize = parseInt(pagesize) || appController.pagesize;
        var page = parseInt(page);
        if (page == 'NaN') {page = 1};
        if (page<=0) {
            this.errorFun('没有了');
            return;
        };
        this.dbcon.executeSqlDefault(sql,[pagesize*(page-1),pagesize], function(tx, result){
            console.log('读取到了收藏列表数据', result);
            var len = result.rows.length;  
            var html = [];
            if (len == 0) {
                console.log('没有了', page, pagesize);
                app.tips('没有了');
                return;
            };
            for (var i=0; i<len; i++){  
                var rs = result.rows.item(i);
                html.push('<li><a aid="'+rs.id+'" href="#">'+rs.title+'</a>');
            }
            $('#favResultList ul').html($(html.join(''))).listview("refresh");
            $('#fav_page_prev').attr({'fav_pid': page-1,'pz': pagesize});
            $('#fav_page_next').attr({'fav_pid': page+1,'pz': pagesize});
            $('#fav_page_end').attr(appFav.prefix + 'pid', Math.ceil(appFav.totalCount/pagesize)).attr('pz', pagesize);
            $('#fav_list_process').text(page+"/" + Math.ceil(appFav.totalCount/pagesize));//进度
            
            $( ":mobile-pagecontainer" ).pagecontainer( "change", "#favList", { transition: "slidedown" } );
        },function(tx,err){
            //alert('没有数据了');
            console.log(tx,err);
            app.tips('err');
        });
    }
});

/**更新**/
var appUpdate = $.extend({}, appController,{
    init: function(){
    },
    //更新一条数据
    updateJoke: function(id){},
    //检查远程更新
    updatecheck: function(){
        //$.ajax({}).done(function(){}).failed(function(){}).always(function(){});
    },
    //获取远程数据更新
    getUpdate: function(){
        
    },
    //发送本地用户增加笑话到远程
    sendUseradd: function(){
        //$.ajax({}).done(function(){}).failed(function(){}).always(function(){});
    }
});

/**
 * 广告相关
 * @type {Object}
 */
var appAd ={
    publisherId: 'a153875d516f50a',
    init: function(){
        //admob 插件不存在，则广告控制取消
        if ( window.plugins && window.plugins.admob ) {

        }else{
            $('#killAd').hide();
            $('#showAdOnlyWifi').parents("li").hide();
            return false;
        }

        //关闭/打开广告按钮事件
        $(document).on('click', '#killAd',function(){
            if ($(this).text() == '关闭广告') {
                appAd.killAd();
            }else{
                if (navigator.connection.type == 'none') {
                    app.tips('网络未连接');return;
                };
                appAd.addBanner();
                app.tips('已打开，60秒后自动关闭');
            }
        });

        //广告接收后60秒自动关闭
        $(document).on('onReceiveAd', function() {
            setTimeout(function(){
                appAd.killAd();
            }, 60000);
        });

        //仅wifi下显示广告按钮
        $(document).on('change', '#showAdOnlyWifi', function(event) {
            app.storage.setItem('showAdOnlyWifi', $(this)[0].checked);
            $(this).flipswitch( "refresh" );
        });
    },
    getPublisherId: function(){
        var admob_ios_key = 'a153875d516f50a';
        var admob_android_key = 'a153875d516f50a';
        return (navigator.userAgent.indexOf('Android') >=0) ? admob_android_key : admob_ios_key;
    },
    addBanner: function() {
        var success = function() { console.log("requestAd Success");};
        var error = function(message) { console.log("Oopsie! " + message);};

        var successCreateBannerView = function() {
            $('#killAd').text("关闭广告").removeClass('ui-btn-active');
            admob.requestAd({'isTesting': false},success,error);
        };
        
        var options = {
            'publisherId': appAd.publisherId,
            'adSize': admob.AD_SIZE.BANNER
        }
        admob.createBannerView(options,successCreateBannerView,error);
    },
    
    addInterstitial: function() {
        var success = function() { console.log("requestAd Success"); };
        var error = function(message) { console.log("Oopsie! " + message); };
        
        var successCreateBannerView = function() { 
            $('#killAd').text("关闭广告").removeClass('ui-btn-active');
            admob.requestAd({'isTesting': false},success,error); 
        };
        var options = {
            'publisherId': appAd.publisherId
        }
        admob.createInterstitialView(options,successCreateBannerView,error);
    },
    
    killAd: function() {
        var success = function() {
            app.tips('广告已关闭，多谢支持！');
            $('#killAd').text("打开广告").addClass('ui-btn-active');
        };
        var error = function(message) { console.log("Oopsie! " + message);};
        admob.killAd(success,error);
    }
};
/**设置**/
var appSetting = $.extend({}, appController,{
    init: function(){
        //上次阅读按钮点击时
        $(document).on('click', '#latestaidBtn', function() {
            app.storage.getItem('latestaid', function(aid){
                var aid=parseInt(aid);
                if (aid) {
                    appSetting.setProcessing(aid);//设置进度
                }else{
                    app.tips('暂无阅读记录');
                }
            });
        });

        //字体设置变更时
        $(document).on('slidestop, change', 'input.setFontSize', function(event){
            var fontsize = $(this).val();
            appSetting.setFontSize(fontsize);
            //存储设置
            app.storage.setItem('seting_font_size', fontsize);
        });

        //进度设置变更时
        $(document).on('slidestop, change', 'input#setProcessing', function(event){
            var aid = $(this).val();
            appSetting.setProcessing(aid);//.slider();
        });

        //菜单按钮被点击时
        $(document).on('menubutton', function(event) {
            $( ":mobile-pagecontainer" ).pagecontainer( "change", "#setting", { transition: "slideup" } );
        });

        //退出按钮被点击时
        $(document).on('click', '#exitApp', function(event) {
            event.preventDefault();
            if(window.confirm('确定退出应用？')){
                navigator.app.exitApp();
            }
        });

    },
    setFontSize: function(value){
        $("#jk_content, #useradd_jk_content").css('font-size',value + 'pt');
        $("input.setFontSize").val(value);
    },
    setProcessing: function(aid){
        if (!aid) {
            app.tips('进度错误！');
            return;
        };
        appController.getOneJoke(aid);
        $('#setProcessing').val(aid);//.slider();
    },
    setShowAdOnlyWifiStatus: function(){
        app.storage.getItem("showAdOnlyWifi",function(value){
            var showAdOnlyWifi = $('#showAdOnlyWifi');
            if (value=="true") {
                showAdOnlyWifi[0].checked = 1;
            }else{
                showAdOnlyWifi[0].checked = 0;
            }
            showAdOnlyWifi.flipswitch();
        }); 
    },
    loadsetting: function(){
        /**
        * 页面初始化时
        */
        app.storage.getItem('latestaid',function(aid){
            if (parseInt(aid)) {
                appSetting.setProcessing(parseInt(aid));//设置进度
            }else{
                //显示列表内容
                console.log('页面初始化开始，查找最新十条数据' );
                appController.getList(1, 10);
            };
        });

        /**
        * 字体设置加载
        */
        app.storage.getItem('seting_font_size',function(value){
            if (!parseInt(value)) {return};
            appSetting.setFontSize(parseInt(value));
        });

        /**
        * 初始化进度的最大值
        */
        $('#setProcessing').attr('max', appController.totalCount);
        
        //wifi按钮状态
        appSetting.setShowAdOnlyWifiStatus();
    }
});

/***应用入口***/
var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    init: function(){
        //初始化控制器
        console.log('init() 开始');
        appController.init();
        appUserAdd.init();
        appFav.init();
        appSetting.init();
        appAd.init();
        appUpdate.init();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        $(document).on('mobileinit',this.onMobileinit);

        $(document).on('deviceready', this.onDeviceReady);

        $(document).on('ready', this.init);

        //分享按钮点击时
        $(document).on('click', '#shareBtn', function(event){
            event.preventDefault();
            app.share(event);
        });
        //不能存在 admob 插件，则不处理广告问题
        if ( !window.plugins || !window.plugins.admob ) {
            return;
        }
        //检测在线状态，wifi在线30秒后，自动显示广告
        $(document).on("online", function() {
            app.storage.getItem("showAdOnlyWifi",function(value){
                if (value=="false" || navigator.connection.type == "wifi") {
                    setTimeout(function(){
                        appAd.addBanner();
                    } ,30000);
                };
            });
        });
        $(document).on('offline', function(event) {
            appAd.killAd();
        });
    },
    //设备就绪时
    onDeviceReady: function(){
        navigator.splashscreen.hide();
    },
    //jquery mobile就绪时
    onMobileinit: function() {
        $.mobile.defaultPageTransition="slide";     //页面默认切换效果
        window.umappkey = '5381fd5256240b7ef6027a5a';//友盟appkey

        //数据初始化检测
        appController.dbcon.isExitTable('article', function(){ 
            /**
            * 检测数据是否初始化成功
            */
            app.storage.getItem('datainit',function(isinit){
                if (isinit !== '1') {
                    appController.datainit();
                    return;
                };
                //加载设置
                appSetting.loadsetting();
            });
        }, function(){
            //第一次启动，初始化数据
            console.log('开始初始化数据库');
            appController.initdatabase();
            //this.init();
        });
    },
    /**
    * 重新加载应用
    */
    reload: function(){
        console.log('刷新应用');
        window.location.reload();
    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    },
    //app提示组件
    //msg 显示内容；showtime：持续时间（可为always）；type: text/loading/html
    tips: function(msg, showtime, type, callback){
        var showtime = showtime || 2000;
        var type = type || "text";//text、loading、html
        if (!msg) {type = "loading"};
        switch (type){
            case 'html':
                $.mobile.loading("show",{html:msg,theme:'b'});
                break;
            case 'loading':
                $.mobile.loading("show",{text:msg,theme:'b',textVisible: true});
                break;
            case "text":
            default:
                $.mobile.loading("show",{text:msg,theme:'b',textonly:true,textVisible: true});
        }
        if (showtime == 'always') {return};
        setTimeout(function(){
            $.mobile.loading('hide');
            if($.isFunction(callback)) callback.call();
        }, showtime);
    },
    /**
    * 存储方法简单封装，暂时使用 localStorage
    */
    storage: {
        getItem: function(key, callback){
            var rs = window.localStorage.getItem(key);
            if($.isFunction(callback)) callback.call(app,rs);
            return rs;
        },
        setItem: function(key,value,callback){
            var rs = window.localStorage.setItem(key,value);
            if($.isFunction(callback)) callback.call(app,rs);
        },
        removeItem: function(key, callback){
            var rs = window.localStorage.removeItem(key);
            if($.isFunction(callback)) callback.call(app,rs);
        },
        clear: function(callback){
            window.localStorage.clear();
            if($.isFunction(callback)) callback.call();
        }
    },
    share: function(event){
        if (window.plugins && window.plugins.socialsharing) {
            window.plugins.socialsharing.share( $('#jk_content').text(),  $('#jk_title').text(), null, 'http://lxxh.lzw.me');
            return;
        };
        console.log('use baidu share');
        //分享插件不存在，则使用百度分享
        //$('#shareBtn').html('<a id="baidu_share></a>"')
        $('#shareBtn').addClass('bdshare_b bdsharebuttonbox').attr('data-cmd', 'more').removeClass('bdshare-button-style0-16');
        window._bd_share_config={
            "common":{
                "bdSnsKey":{"tsina":"1602484039"},
                "bdMini":"1",
                "bdMiniList":false,
                "bdPic":"",
                "onBeforeClick": function(shareBtn,config){
                    config.bdText = $('#jk_content').text();
                    return config;
                }
            },
            "share":{},
            "image":{"viewList":[],"viewText":"分享：","viewSize":"16"},
            "selectShare":{"bdContainerClass":null,"bdSelectMiniList":[]}
        };
        var btn = $('<div class="bdsharebuttonbox"><a href="#" class="bds_more" data-cmd="more"></a></div>').appendTo('body');

        app.util.addScript('http://bdimg.share.baidu.com/static/api/js/share.js?v=89860593.js');
    }, 
    util:{
        addScript: function(filename){
            //如果已经存在，则不加载
            var list = document.getElementsByTagName('script');
            for (var i = list.length - 1; i >= 0; i--) {
                if(list[i].src.indexOf(filename) != -1){
                    return;
                }
            };

            var fileref = document.createElement('script');
            fileref.setAttribute('type', 'text/javascript');
            fileref.setAttribute('src', filename);
            document.getElementsByTagName('head')[0].appendChild(fileref);
        },
        addCss: function(filename){
            var list = document.getElementsByTagName('link');
            for (var i = list.length - 1; i >= 0; i--) {
                if(list[i].href.indexOf(filename) != -1){
                    return;
                }
            };

            var fileref = document.createElement('link');
            fileref.setAttribute('rel', 'stylesheet');
            fileref.setAttribute('type', 'text/css');
            fileref.setAttribute('href', filename);
            document.getElementsByTagName('head')[0].appendChild(fileref);
        }
    }
};
