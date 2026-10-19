-- Migration 008: เพิ่มการตั้งค่าระยะเซ็นเซอร์ตรวจจับรถแยกรายช่องจอด
-- sensor_enter_cm: ระยะตรวจจับรถเข้า (ถ้าวัดได้น้อยกว่าค่านี้ถือว่ามีรถจอด) ค่าเริ่มต้น 9.0 ซม.
-- sensor_exit_cm: ระยะตรวจจับรถออก (ถ้าวัดได้มากกว่าค่านี้ถือว่าช่องว่าง) ค่าเริ่มต้น 11.0 ซม.

ALTER TABLE slots 
ADD COLUMN IF NOT EXISTS sensor_enter_cm numeric DEFAULT 9.0,
ADD COLUMN IF NOT EXISTS sensor_exit_cm numeric DEFAULT 11.0;

-- เพิ่มคอลัมน์เก็บระยะที่เซ็นเซอร์วัดได้ล่าสุด (distance_cm) ในตาราง devices
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS distance_cm numeric;
