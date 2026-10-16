-- Migration 006: Slot customization (drag-and-drop coordinates, custom slot types, and dynamic pricing)

-- 1. Add price_per_hour (default 20 Baht/hour)
ALTER TABLE slots ADD COLUMN IF NOT EXISTS price_per_hour NUMERIC NOT NULL DEFAULT 20;

-- 2. Add relative coordinates on floor plan image (percentage 0 - 100%)
ALTER TABLE slots ADD COLUMN IF NOT EXISTS pos_x NUMERIC DEFAULT NULL;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS pos_y NUMERIC DEFAULT NULL;

-- 3. Update existing slots to default 'ลูกค้าทั่วไป' if still 'ปกติ'
UPDATE slots SET type = 'ลูกค้าทั่วไป' WHERE type = 'ปกติ' OR type IS NULL;
