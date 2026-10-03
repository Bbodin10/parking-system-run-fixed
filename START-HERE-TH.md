# เริ่มระบบแบบไม่ค้างหน้า Loading

## 1. ตั้งค่า Backend

```powershell
cd backend
copy .env.example .env
npm install
npm run dev
```

แก้ `backend/.env` ให้ครบ แล้วเปิด `http://localhost:3000/api/health` ต้องได้ `{ "ok": true }`

## 2. ตั้งค่า Frontend

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

`frontend/.env` สำหรับ Local ต้องเป็น `VITE_API_URL=/api`

## 3. ถ้าเคยเข้าใช้เวอร์ชันเก่า

เปิด DevTools Console แล้วรัน:

```js
localStorage.clear(); location.reload();
```

เวอร์ชันนี้จะไม่ค้างหน้า Loading: หาก Backend, Token หรือ Supabase ผิด จะมีข้อความ Error และปุ่ม **ลองใหม่ / กลับไปเข้าสู่ระบบ**

## 4. Migrations

รัน `database/migrations/001_schema.sql` ถึง `004_admin_controls_and_maps.sql` ตามลำดับ
