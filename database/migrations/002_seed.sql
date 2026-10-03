insert into slots(id,code,floor,slot_order) values
('A1','A1',1,0),('A2','A2',1,1),('A3','A3',1,2),('A4','A4',1,3),('A5','A5',1,4),('A6','A6',1,5),
('B1','B1',2,0),('B2','B2',2,1),('B3','B3',2,2),('B4','B4',2,3),('B5','B5',2,4),('B6','B6',2,5)
on conflict(id) do nothing;

-- ไม้กั้นประตู (ยังไม่ผูกกับช่องจอด)
insert into devices(id,name,type,floor,state,status,linked_slot) values
('barrier-in-1', 'ไม้กั้นเข้า ชั้น 1',  'barrier', 1, 'closed', 'offline', null),
('barrier-out-1','ไม้กั้นออก ชั้น 1', 'barrier', 1, 'closed', 'offline', null)
on conflict(id) do nothing;

-- เซ็นเซอร์อัลตราโซนิก (A-Left Controller: A1, A2, A3)
insert into devices(id,name,type,floor,state,status,linked_slot,presence) values
('sensor-A1', 'เซ็นเซอร์ A1', 'sensor', 1, null, 'offline', 'A1', 'unknown'),
('sensor-A2', 'เซ็นเซอร์ A2', 'sensor', 1, null, 'offline', 'A2', 'unknown'),
('sensor-A3', 'เซ็นเซอร์ A3', 'sensor', 1, null, 'offline', 'A3', 'unknown')
on conflict(id) do nothing;

-- ไม้กั้นประจำช่อง (A-Left Controller: A1, A2, A3)
insert into devices(id,name,type,floor,state,status,linked_slot) values
('barrier-A1', 'ไม้กั้น A1', 'barrier', 1, 'closed', 'offline', 'A1'),
('barrier-A2', 'ไม้กั้น A2', 'barrier', 1, 'closed', 'offline', 'A2'),
('barrier-A3', 'ไม้กั้น A3', 'barrier', 1, 'closed', 'offline', 'A3')
on conflict(id) do nothing;
