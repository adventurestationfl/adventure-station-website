-- Development-only starter content based on the historical site. No invented dates or sales.
INSERT OR IGNORE INTO staff(id,email,subject,name,role) VALUES('local-owner','developer@example.invalid','local-owner','Local developer','owner');
INSERT OR IGNORE INTO workshops(id,slug,name,summary,description,category,materials,instructions,status)
VALUES('seasonal-crafts','seasonal-crafts','Seasonal crafts & art','A little imagination, a hands-on project, and something special to take home.','Explore seasonal arts and crafts designed for young creators. Details for the next workshop will be announced here.','Arts & crafts','','','draft');
