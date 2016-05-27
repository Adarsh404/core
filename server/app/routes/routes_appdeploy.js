/*
Copyright [2016] [Relevance Lab]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
var logger = require('_pr/logger')(module);
var AppDeploy = require('_pr/model/app-deploy/app-deploy');
var errorResponses = require('./error_responses');
var AppData = require('_pr/model/app-deploy/app-data');
var masterUtil = require('_pr/lib/utils/masterUtil.js');
var apiUtil = require('_pr/lib/utils/apiUtil.js');
var instancesDao = require('../model/classes/instance/instance');
var Task = require('../model/classes/tasks/tasks.js');
var async = require('async');

module.exports.setRoutes = function(app, sessionVerificationFunc) {
    app.all('/app/deploy/*', sessionVerificationFunc);

    // Get all AppDeploy
    app.get('/app/deploy', function(req, res) {
        AppDeploy.getAppDeploy(function(err, appDeployes) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            if (appDeployes) {
                res.status(200).send(appDeployes);
                return;
            }
        });
    });

    app.get('/app/deploy/organization/:orgId/businessgroup/:bgId/project/:projectId/environment/:envId/newAppDeploy', function(req, res) {
        var jsonData= {
            orgId: req.params.orgId,
            bgId: req.params.bgId,
            projectId: req.params.projectId,
            envId: req.params.envId,
            nexusId:'26',
            dockerId:'18'
        };
         async.parallel({
                            tasks:function(callback) {
                                Task.getTasksByOrgBgProjectAndEnvId(jsonData, callback)
                            },
                            docker:function(callback) {
                                masterUtil.getDockerServer(jsonData, callback)
                            },
                            nexus:function(callback) {
                                masterUtil.getNexusServer(jsonData, callback)
                            }
                        },
                        function(err, results){
                            if(err)
                                res.status(500).send({
                                    code:500,
                                    erroMessage:"Internal Server Error"});
                            else if(!results)
                                res.status(404).send({
                                    code:404,
                                    erroMessage:"Data is not available for Organization"+req.params.orgId});
                            else
                                res.status(200).send(results);
                        }
                    );
    });

    // Create AppDeploy
    app.post('/app/deploy', function(req, res) {
        logger.debug("Got appDeploy data: ", JSON.stringify(req.body.appDeployData));
        var appDeployData = req.body.appDeployData;
        var instanceIp = appDeployData.applicationNodeIP.trim().split(" ")[0];
        instancesDao.getInstanceByIP(instanceIp, function(err, instance) {
            if (err) {
                logger.error("Failed to fetch instance: ", err);
                res.status(500).send("Failed to fetch instance.");
                return;
            }
            if (instance.length) {
                var anInstance = instance[0];
                appDeployData['projectId'] = anInstance.projectId;
                AppDeploy.createNew(appDeployData, function(err, appDeploy) {
                    if (err) {
                        res.status(500).send(errorResponses.db.error);
                        return;
                    }
                    if (appDeploy) {
                        if (appDeployData.containerId && !appDeployData.containerId === "" && !appDeployData.containerId === "NA") {
                            var appData = {
                                "projectId": anInstance.projectId,
                                "envId": appDeployData.envId,
                                "appName": appDeployData.applicationName,
                                "version": appDeployData.applicationVersion
                            };
                            AppData.createNewOrUpdate(appData, function(err, data) {
                                if (err) {
                                    logger.debug("Failed to create or update app-data: ", err);
                                }
                                if (data) {
                                    logger.debug("Created or Updated app-data successfully: ", data);
                                }
                            });
                        }
                        res.status(200).send(appDeploy);
                        return;
                    }
                });
            } else {
                res.status(404).send("Project not found for instanceip.");
                return;
            }
        });
    });

    // Get AppDeploy w.r.t. appName and env
    app.get('/app/deploy/env/:envId/project/:projectId/list', function(req, res) {
        logger.debug("/app/deploy/env/:envId/list called...");
        masterUtil.getAppDataWithDeployList(req.params.envId, req.params.projectId, function(err, appDeploy) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            if (appDeploy.length) {
                res.status(200).send(appDeploy);
                return;
            } else {
                res.send([]);
                return;
            }
        });
    });

    // Create or update AppData
    app.post('/app/deploy/data/create', function(req, res) {
        AppData.createNewOrUpdate(req.body.appData, function(err, appData) {
            if (err) {
                res.status(500).send("Failed to get appData.");
                return;
            }
            if (appData) {
                res.status(200).send(appData);
                return;
            }
        });
    });

    // Get all AppData by name
    app.get('/app/deploy/data/node/:nodeIp/project/:projectId/env/:envName', function(req, res) {
        AppData.getAppDataByIpAndProjectAndEnv(req.params.nodeIp, req.params.projectId, req.params.envName, function(err, appDatas) {
            if (err) {
                res.status(500).send("Please add app name.");
                return;
            }
            if (appDatas) {
                res.status(200).send(appDatas);
                return;
            }
        });
    });


    // Get respective Logs
    app.get('/app/deploy/:appId/logs', function(req, res) {
        logger.debug("Logs api called...");
        AppDeploy.getAppDeployById(req.params.appId, function(err, appDeploy) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            if (!appDeploy) {
                res.status(404).send("appDeploy not found!");
                return;
            }
            AppDeploy.getAppDeployLogById(req.params.appId, function(err, logs) {
                if (err) {
                    res.status(500).send(errorResponses.db.error);
                    return;
                }
                if (logs) {
                    res.status(200).send(logs);
                    return;
                } else {
                    res.status(404).send("Logs not available.");
                    return;
                }
            });
        });
    });

    // Get AppDeploy w.r.t. env
    app.get('/app/deploy/env/:envId', function(req, res) {
        logger.debug("Filtered by env called..");
        AppDeploy.getAppDeployByEnvId(req.params.envId, function(err, appDeploy) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            if (appDeploy) {
                res.status(200).send(appDeploy);
                return;
            } else {
                res.send([]);
                return;
            }
        });
    });



    /*app.get('/app/deploy/project/:projectId/appDeployList', getAppDeployListForProject);

    function getAppDeployListForProject(req, res, next) {
        async.waterfall(
            [
                function(next) {
                    d4dModelNew.d4dModelMastersProjects.find
                },
                function(paginationReq,next){
                    apiUtil.paginationRequest(req.query,'appDeploy',next);
                },
                providerService.getUnassignedInstancesByProvider,
                providerService.createUnassignedInstancesList
            ],
            function(err, results) {
                if(err) {
                    next(err);
                } else {
                    return res.status(200).send(results);
                }
            }
        );
    }*/

    // Get AppDeploy w.r.t. projectId
    app.get('/app/deploy/project/:projectId/list', function(req, res) {

        logger.debug("Filtered by projectId called..");
        masterUtil.getAppDeployListForProject(req.params.projectId, function(err, appDeploy) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            if (appDeploy) {
                res.status(200).send(appDeploy);
                return;
            } else {
                res.send([]);
                return;
            }
        });
    });


    // Get  appData by Project and Env
    app.get('/app/deploy/project/:projectId/env/:envId/application/:appName', function(req, res) {
        logger.debug("version= ",req.query.version);
        AppDeploy.getAppDeployByProjectAndEnv(req.params.projectId, req.params.envId,req.params.appName, req.query.version, function(err, appData) {
            if (err) {
                res.status(500).send(errorResponses.db.error);
                return;
            }
            res.status(200).send(appData);
            return;
        });
    });
};