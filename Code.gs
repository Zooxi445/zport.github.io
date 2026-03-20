var SCRIPT_PROPS = PropertiesService.getScriptProperties();

var DISCORD_CLIENT_ID     = SCRIPT_PROPS.getProperty("DISCORD_CLIENT_ID")     || "1457078982033014972";
var DISCORD_CLIENT_SECRET = SCRIPT_PROPS.getProperty("DISCORD_CLIENT_SECRET") || "uV2SF-pCCUZ3_z-WLxaXy-037ZFvK7m6";
var CREATOR_ID            = "913813330215464980";
var REQUIRED_GUILD_ID     = "1384569722569494689";
var UNIVERSE_ID           = "101411193179895";

var PERMS = {
  EDIT_HOME:     "edit_home",
  EDIT_BLOG:     "edit_blog",
  EDIT_WORKS:    "edit_works",
  EDIT_PRICES:   "edit_prices",
  EDIT_SHOP:     "edit_shop",
  EDIT_FAQ:      "edit_faq",
  EDIT_THEME:    "edit_theme",
  MANAGE_ADMINS: "manage_admins",
  MANAGE_PAGES:  "manage_pages",
  MANAGE_USERS:  "manage_users"
};

function makeKey(token){ return "s_" + String(token).replace(/[^a-zA-Z0-9]/g,""); }

function saveSession(token, data){
  var slim = {
    id:            String(data.id            || ""),
    username:      String(data.username      || ""),
    global_name:   String(data.global_name   || data.username || ""),
    avatar:        String(data.avatar        || ""),
    discriminator: String(data.discriminator || "0"),
    inGuild:       data.inGuild === true
  };
  try { SCRIPT_PROPS.setProperty(makeKey(token), JSON.stringify(slim)); }
  catch(e){ throw new Error("Session save failed: " + e.message); }
}

function getSession(token){
  if (!token) return null;
  try {
    var raw = SCRIPT_PROPS.getProperty(makeKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

function deleteSession(token){
  try { SCRIPT_PROPS.deleteProperty(makeKey(token)); } catch(e){}
}

function getAdmins(){
  try {
    var raw = SCRIPT_PROPS.getProperty("admins");
    return raw ? JSON.parse(raw) : {};
  } catch(e){ return {}; }
}

function saveAdmins(data){
  if (!data[CREATOR_ID]) data[CREATOR_ID] = { name:"Creator", permissions: Object.values(PERMS) };
  SCRIPT_PROPS.setProperty("admins", JSON.stringify(data));
}

function isAdmin(userId){ return userId === CREATOR_ID || !!getAdmins()[userId]; }

function hasPerm(userId, perm){
  if (userId === CREATOR_ID) return true;
  var admins = getAdmins();
  return admins[userId] && admins[userId].permissions && admins[userId].permissions.indexOf(perm) !== -1;
}

function getBannedUsers(){
  try {
    var raw = SCRIPT_PROPS.getProperty("banned_users");
    return raw ? JSON.parse(raw) : {};
  } catch(e){ return {}; }
}

function saveBannedUsers(data){ SCRIPT_PROPS.setProperty("banned_users", JSON.stringify(data)); }

function isBanned(userId){ return !!getBannedUsers()[userId]; }

function getUsers(){
  try {
    var raw = SCRIPT_PROPS.getProperty("users");
    return raw ? JSON.parse(raw) : {};
  } catch(e){ return {}; }
}

function saveUsers(data){
  var json = JSON.stringify(data);
  if (json.length > 8500){
    var keys = Object.keys(data).sort(function(a,b){ return (data[a].lastSeen||0)-(data[b].lastSeen||0); });
    while (JSON.stringify(data).length > 8500 && keys.length > 50){
      delete data[keys.shift()];
    }
  }
  try { SCRIPT_PROPS.setProperty("users", JSON.stringify(data)); } catch(e){}
}

function trackUser(userData, inGuild){
  var users = getUsers();
  users[userData.id] = {
    id:          userData.id,
    username:    userData.global_name || userData.username || "",
    avatar:      userData.avatar || "",
    inGuild:     inGuild,
    lastSeen:    Date.now()
  };
  saveUsers(users);
}

function getSiteData(){
  try {
    var raw = SCRIPT_PROPS.getProperty("site_data");
    return raw ? JSON.parse(raw) : getDefaultSiteData();
  } catch(e){ return getDefaultSiteData(); }
}

function saveSiteData(data){
  var value = JSON.stringify(data);
  if (value.length > 9000) throw new Error("Content too large — shorten your text.");
  SCRIPT_PROPS.setProperty("site_data", value);
}

function getDefaultSiteData(){
  return {
    theme:{ accentColor:"#f5c518", bgColor:"#08090d", textColor:"#f0f0f0", fontHead:"Bebas Neue", fontBody:"Barlow", neon:false },
    home:{
      title:"", tagline:"", bio:"",
      hireUrl:"",
      useCustomBg:false, customBg:"",
      statsOverride:null,
      works:[]
    },
    blog:{ posts:[] },
    prices:{ items:[] },
    shop:{ items:[] },
    faq:{ items:[] },
    pages:{
      home:  { enabled:true,  label:"Home"   },
      blog:  { enabled:true,  label:"Blog"   },
      prices:{ enabled:true,  label:"Prices" },
      shop:  { enabled:true,  label:"Shop"   },
      faq:   { enabled:true,  label:"FAQ"    }
    },
    customPages:[],
    social:{ discord:"https://discord.gg/qtNsBEkgFz", twitter:"", github:"" }
  };
}

function doGet(e){
  var p = e.parameter || {};
  var action = p.action || "";

  if (action === "discord_callback") return handleDiscordCallback(p.code);
  if (action === "api")              return handleApi(p);
  if (action === "logout"){
    if (p.token) deleteSession(p.token);
    return HtmlService.createHtmlOutput("<script>localStorage.removeItem('ss_session');window.location='" + getBaseUrl() + "';<\/script>");
  }

  var tpl = HtmlService.createTemplateFromFile("index");
  tpl.BASE_URL          = getBaseUrl();
  tpl.DISCORD_CLIENT_ID = DISCORD_CLIENT_ID;
  return tpl.evaluate()
    .setTitle("Portfolio")
    .addMetaTag("viewport","width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleDiscordCallback(code){
  if (!code) return errorPage("No code from Discord.");
  var baseUrl = getBaseUrl();

  var tokenRes;
  try {
    tokenRes = UrlFetchApp.fetch("https://discord.com/api/oauth2/token",{
      method:"post",
      payload:{ client_id:DISCORD_CLIENT_ID, client_secret:DISCORD_CLIENT_SECRET, grant_type:"authorization_code", code:code, redirect_uri:baseUrl+"?action=discord_callback" },
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      muteHttpExceptions:true
    });
  } catch(e){ return errorPage("Token exchange failed: " + e.message); }

  var tokenData = JSON.parse(tokenRes.getContentText());
  if (!tokenData.access_token) return errorPage("Auth failed: " + tokenRes.getContentText());

  var userRes = UrlFetchApp.fetch("https://discord.com/api/users/@me",{
    headers:{"Authorization":"Bearer " + tokenData.access_token},
    muteHttpExceptions:true
  });
  var userData = JSON.parse(userRes.getContentText());
  if (!userData || !userData.id) return errorPage("No user ID from Discord.");

  var inGuild = false;
  try {
    var guildsRes = UrlFetchApp.fetch("https://discord.com/api/users/@me/guilds",{
      headers:{"Authorization":"Bearer " + tokenData.access_token},
      muteHttpExceptions:true
    });
    var guilds = JSON.parse(guildsRes.getContentText());
    if (Array.isArray(guilds)){
      inGuild = guilds.some(function(g){ return g.id === REQUIRED_GUILD_ID; });
    }
  } catch(e){}

  var sessionToken = Utilities.getUuid().replace(/-/g,"");
  try {
    saveSession(sessionToken,{
      id:            userData.id,
      username:      userData.username      || "",
      discriminator: userData.discriminator || "0",
      avatar:        userData.avatar        || "",
      global_name:   userData.global_name   || userData.username || "",
      inGuild:       inGuild
    });
  } catch(e){ return errorPage("Session error: " + e.message); }

  trackUser(userData, inGuild);

  return HtmlService.createHtmlOutput(
    "<script>try{localStorage.setItem('ss_session','"+sessionToken+"');}catch(e){}window.location='"+baseUrl+"';<\/script>"
  );
}

function handleApi(p){
  var ep = p.endpoint || "";

  if (ep === "sitedata")  return jsonResponse(getSiteData());
  if (ep === "gamestats") return proxyFetch("https://games.roproxy.com/v1/games?universeIds="+UNIVERSE_ID);

  if (ep === "me"){
    var token = p.token || "";
    if (!token) return jsonResponse({ error:"no_token" });
    if (isBanned(token)) return jsonResponse({ error:"banned" });
    var sess = getSession(token);
    if (!sess) return jsonResponse({ error:"invalid_session" });
    if (isBanned(sess.id)) return jsonResponse({ error:"banned", id:sess.id });
    var admins = getAdmins();
    sess.is_admin    = isAdmin(sess.id);
    sess.is_creator  = sess.id === CREATOR_ID;
    sess.permissions = sess.id === CREATOR_ID ? Object.values(PERMS) : (admins[sess.id] ? admins[sess.id].permissions||[] : []);
    return jsonResponse({ user:sess });
  }

  if (ep === "send_message"){
    var token2 = p.token || "";
    var sess2 = getSession(token2);
    if (!sess2) return jsonResponse({ error:"not_logged_in" });
    if (isBanned(sess2.id)) return jsonResponse({ error:"banned" });
    var msg = {
      userId:   sess2.id,
      username: sess2.global_name || sess2.username,
      type:     p.msgType  || "General",
      subject:  p.subject  || "",
      body:     p.body     || "",
      time:     new Date().toISOString()
    };
    var msgs = getMessages();
    msgs.unshift(msg);
    if (msgs.length > 100) msgs = msgs.slice(0,100);
    saveMessages(msgs);
    return jsonResponse({ ok:true });
  }

  if (ep === "get_messages"){
    var token3 = p.token || "";
    var sess3 = getSession(token3);
    if (!sess3 || !hasPerm(sess3.id, PERMS.MANAGE_USERS)) return jsonResponse({ error:"unauthorized" });
    return jsonResponse({ messages: getMessages() });
  }

  var sess4 = getSession(p.token || "");
  if (!sess4) return jsonResponse({ error:"unauthorized" });

  if (ep === "save_sitedata"){
    try {
      var inc = JSON.parse(decodeURIComponent(p.body||"{}"));
      var cur = getSiteData();
      if (inc.home    && hasPerm(sess4.id, PERMS.EDIT_HOME))    cur.home    = inc.home;
      if (inc.blog    && hasPerm(sess4.id, PERMS.EDIT_BLOG))    cur.blog    = inc.blog;
      if (inc.prices  && hasPerm(sess4.id, PERMS.EDIT_PRICES))  cur.prices  = inc.prices;
      if (inc.shop    && hasPerm(sess4.id, PERMS.EDIT_SHOP))    cur.shop    = inc.shop;
      if (inc.faq     && hasPerm(sess4.id, PERMS.EDIT_FAQ))     cur.faq     = inc.faq;
      if (inc.theme   && hasPerm(sess4.id, PERMS.EDIT_THEME))   cur.theme   = inc.theme;
      if (inc.pages   && hasPerm(sess4.id, PERMS.MANAGE_PAGES)) cur.pages   = inc.pages;
      if (inc.customPages && hasPerm(sess4.id, PERMS.MANAGE_PAGES)) cur.customPages = inc.customPages;
      if (inc.social  && hasPerm(sess4.id, PERMS.EDIT_HOME))    cur.social  = inc.social;
      saveSiteData(cur);
      return jsonResponse({ ok:true });
    } catch(e){ return jsonResponse({ error:e.message }); }
  }

  if (ep === "get_admins"){
    if (!hasPerm(sess4.id, PERMS.MANAGE_ADMINS)) return jsonResponse({ error:"no_perm" });
    return jsonResponse({ admins:getAdmins(), perms:PERMS });
  }

  if (ep === "save_admins"){
    if (!hasPerm(sess4.id, PERMS.MANAGE_ADMINS)) return jsonResponse({ error:"no_perm" });
    try {
      var newAdmins = JSON.parse(decodeURIComponent(p.body||"{}"));
      saveAdmins(newAdmins);
      return jsonResponse({ ok:true });
    } catch(e){ return jsonResponse({ error:e.message }); }
  }

  if (ep === "get_users"){
    if (!hasPerm(sess4.id, PERMS.MANAGE_USERS)) return jsonResponse({ error:"no_perm" });
    var users = getUsers();
    var banned = getBannedUsers();
    return jsonResponse({ users:users, banned:banned });
  }

  if (ep === "ban_user"){
    if (!hasPerm(sess4.id, PERMS.MANAGE_USERS)) return jsonResponse({ error:"no_perm" });
    var targetId = p.targetId || "";
    if (!targetId || targetId === CREATOR_ID) return jsonResponse({ error:"cannot_ban" });
    var banned2 = getBannedUsers();
    banned2[targetId] = { by:sess4.id, at:new Date().toISOString() };
    saveBannedUsers(banned2);
    var users2 = getUsers();
    if (users2[targetId]) users2[targetId].banned = true;
    saveUsers(users2);
    return jsonResponse({ ok:true });
  }

  if (ep === "unban_user"){
    if (!hasPerm(sess4.id, PERMS.MANAGE_USERS)) return jsonResponse({ error:"no_perm" });
    var targetId2 = p.targetId || "";
    var banned3 = getBannedUsers();
    delete banned3[targetId2];
    saveBannedUsers(banned3);
    var users3 = getUsers();
    if (users3[targetId2]) users3[targetId2].banned = false;
    saveUsers(users3);
    return jsonResponse({ ok:true });
  }

  return jsonResponse({ error:"unknown_endpoint" });
}

function getMessages(){
  try {
    var raw = SCRIPT_PROPS.getProperty("messages");
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}

function saveMessages(msgs){
  try { SCRIPT_PROPS.setProperty("messages", JSON.stringify(msgs)); } catch(e){}
}

function proxyFetch(url){
  try {
    var r = UrlFetchApp.fetch(url,{muteHttpExceptions:true});
    return jsonResponse(JSON.parse(r.getContentText()));
  } catch(e){ return jsonResponse({error:"fetch_failed"}); }
}

function getBaseUrl(){ return ScriptApp.getService().getUrl(); }

function jsonResponse(data){
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function errorPage(msg){
  return HtmlService.createHtmlOutput(
    "<body style='font-family:sans-serif;padding:40px;background:#08090d;color:#f0f0f0'>" +
    "<h2 style='color:#e63946'>Auth Error</h2><p>"+msg+"</p>" +
    "<a href='"+getBaseUrl()+"' style='color:#f5c518'>← Back</a></body>"
  );
}
