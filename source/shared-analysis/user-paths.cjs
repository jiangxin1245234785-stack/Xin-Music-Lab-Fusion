'use strict';
const path=require('node:path');
// Music and results are user data, not paths relative to a movable application.
function defaultUserPaths(app){return {libraryRoot:app.getPath('music'),analysisRoot:path.join(app.getPath('documents'),'Xin Music Lab','Analysis')};}
module.exports={defaultUserPaths};
