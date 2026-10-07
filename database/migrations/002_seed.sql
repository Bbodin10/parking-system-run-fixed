insert into slots(id,code,floor,slot_order) values
('A1','A1',1,0),('A2','A2',1,1),('A3','A3',1,2),('A4','A4',1,3),('A5','A5',1,4),('A6','A6',1,5),
('B1','B1',2,0),('B2','B2',2,1),('B3','B3',2,2),('B4','B4',2,3),('B5','B5',2,4),('B6','B6',2,5)
on conflict(id) do nothing;

-- เซ็นเซอร์อัลตราโซนิกประจำช่องจอด (12 ช่อง: A1-A6 ชั้น 1, B1-B6 ชั้น 2)
insert into devices(id,name,type,floor,state,status,linked_slot,presence) values
('sensor-A1', 'เซ็นเซอร์ A1', 'sensor', 1, null, 'offline', 'A1', 'empty'),
('sensor-A2', 'เซ็นเซอร์ A2', 'sensor', 1, null, 'offline', 'A2', 'empty'),
('sensor-A3', 'เซ็นเซอร์ A3', 'sensor', 1, null, 'offline', 'A3', 'empty'),
('sensor-A4', 'เซ็นเซอร์ A4', 'sensor', 1, null, 'offline', 'A4', 'empty'),
('sensor-A5', 'เซ็นเซอร์ A5', 'sensor', 1, null, 'offline', 'A5', 'empty'),
('sensor-A6', 'เซ็นเซอร์ A6', 'sensor', 1, null, 'offline', 'A6', 'empty'),
('sensor-B1', 'เซ็นเซอร์ B1', 'sensor', 2, null, 'offline', 'B1', 'empty'),
('sensor-B2', 'เซ็นเซอร์ B2', 'sensor', 2, null, 'offline', 'B2', 'empty'),
('sensor-B3', 'เซ็นเซอร์ B3', 'sensor', 2, null, 'offline', 'B3', 'empty'),
('sensor-B4', 'เซ็นเซอร์ B4', 'sensor', 2, null, 'offline', 'B4', 'empty'),
('sensor-B5', 'เซ็นเซอร์ B5', 'sensor', 2, null, 'offline', 'B5', 'empty'),
('sensor-B6', 'เซ็นเซอร์ B6', 'sensor', 2, null, 'offline', 'B6', 'empty')
on conflict(id) do nothing;

-- ไม้กั้นประจำช่องจอด (12 ช่อง เท่าจำนวนช่องจอด ไม่มีไม้กั้นประจำชั้น)
insert into devices(id,name,type,floor,state,status,linked_slot) values
('barrier-A1', 'ไม้กั้นช่อง A1', 'barrier', 1, 'closed', 'offline', 'A1'),
('barrier-A2', 'ไม้กั้นช่อง A2', 'barrier', 1, 'closed', 'offline', 'A2'),
('barrier-A3', 'ไม้กั้นช่อง A3', 'barrier', 1, 'closed', 'offline', 'A3'),
('barrier-A4', 'ไม้กั้นช่อง A4', 'barrier', 1, 'closed', 'offline', 'A4'),
('barrier-A5', 'ไม้กั้นช่อง A5', 'barrier', 1, 'closed', 'offline', 'A5'),
('barrier-A6', 'ไม้กั้นช่อง A6', 'barrier', 1, 'closed', 'offline', 'A6'),
('barrier-B1', 'ไม้กั้นช่อง B1', 'barrier', 2, 'closed', 'offline', 'B1'),
('barrier-B2', 'ไม้กั้นช่อง B2', 'barrier', 2, 'closed', 'offline', 'B2'),
('barrier-B3', 'ไม้กั้นช่อง B3', 'barrier', 2, 'closed', 'offline', 'B3'),
('barrier-B4', 'ไม้กั้นช่อง B4', 'barrier', 2, 'closed', 'offline', 'B4'),
('barrier-B5', 'ไม้กั้นช่อง B5', 'barrier', 2, 'closed', 'offline', 'B5'),
('barrier-B6', 'ไม้กั้นช่อง B6', 'barrier', 2, 'closed', 'offline', 'B6')
on conflict(id) do nothing;
