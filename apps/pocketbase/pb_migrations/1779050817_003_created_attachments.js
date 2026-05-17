/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Fetch related collections to get their IDs
  const selectedBenefitsCollection = app.findCollectionByNameOrId("selectedBenefits");
  const employeesCollection = app.findCollectionByNameOrId("employees");

  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "employeeId = @request.auth.id || @request.auth.isAdmin = true",
    "fields":     [
          {
                "autogeneratePattern": "[a-z0-9]{15}",
                "hidden": false,
                "id": "text0002983240",
                "max": 15,
                "min": 15,
                "name": "id",
                "pattern": "^[a-z0-9]+$",
                "presentable": false,
                "primaryKey": true,
                "required": true,
                "system": true,
                "type": "text"
          },
          {
                "hidden": false,
                "id": "relation1478107274",
                "name": "selectedBenefitId",
                "presentable": false,
                "primaryKey": false,
                "required": true,
                "system": false,
                "type": "relation",
                "cascadeDelete": false,
                "collectionId": selectedBenefitsCollection.id,
                "displayFields": [],
                "maxSelect": 1,
                "minSelect": 0
          },
          {
                "hidden": false,
                "id": "relation6076700741",
                "name": "employeeId",
                "presentable": false,
                "primaryKey": false,
                "required": true,
                "system": false,
                "type": "relation",
                "cascadeDelete": false,
                "collectionId": employeesCollection.id,
                "displayFields": [],
                "maxSelect": 1,
                "minSelect": 0
          },
          {
                "hidden": false,
                "id": "text6382200217",
                "name": "fileName",
                "presentable": false,
                "primaryKey": false,
                "required": true,
                "system": false,
                "type": "text",
                "autogeneratePattern": "",
                "max": 0,
                "min": 0,
                "pattern": ""
          },
          {
                "hidden": false,
                "id": "file9597601892",
                "name": "file",
                "presentable": false,
                "primaryKey": false,
                "required": false,
                "system": false,
                "type": "file",
                "maxSelect": 1,
                "maxSize": 20971520,
                "mimeTypes": [
                      "application/pdf",
                      "image/jpeg",
                      "image/png",
                      "image/gif",
                      "image/webp",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ],
                "thumbs": []
          },
          {
                "hidden": false,
                "id": "text3891582739",
                "name": "fileType",
                "presentable": false,
                "primaryKey": false,
                "required": false,
                "system": false,
                "type": "text",
                "autogeneratePattern": "",
                "max": 0,
                "min": 0,
                "pattern": ""
          },
          {
                "hidden": false,
                "id": "autodate9624710433",
                "name": "uploadedAt",
                "presentable": false,
                "primaryKey": false,
                "required": false,
                "system": false,
                "type": "autodate",
                "onCreate": true,
                "onUpdate": false
          },
          {
                "hidden": false,
                "id": "autodate6939068291",
                "name": "created",
                "onCreate": true,
                "onUpdate": false,
                "presentable": false,
                "system": false,
                "type": "autodate"
          },
          {
                "hidden": false,
                "id": "autodate6309346434",
                "name": "updated",
                "onCreate": true,
                "onUpdate": true,
                "presentable": false,
                "system": false,
                "type": "autodate"
          }
    ],
    "id": "pbc_5672374246",
    "indexes": [],
    "listRule": "employeeId = @request.auth.id || @request.auth.isAdmin = true",
    "name": "attachments",
    "system": false,
    "type": "base",
    "updateRule": "employeeId = @request.auth.id || @request.auth.isAdmin = true",
    "viewRule": "employeeId = @request.auth.id || @request.auth.isAdmin = true"
  });

  try {
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("Collection name must be unique")) {
      console.log("Collection already exists, skipping");
      return;
    }
    throw e;
  }
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_5672374246");
    return app.delete(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
