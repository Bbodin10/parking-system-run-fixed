import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './index.css';

const rawApi = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API = (isLocal && (import.meta.env.DEV || rawApi.includes('localhost') || !rawApi))
  ? 'http://localhost:3000/api'
  : (rawApi ? (rawApi.endsWith('/api') ? rawApi : `${rawApi}/api`) : (isLocal ? 'http://localhost:3000/api' : '/api'));

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(API + path, {
    ...options,
    headers: {
      ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      ...(localStorage.token ? { Authorization: `Bearer ${localStorage.token}` } : {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return payload;
}

const formatMoney = (value) => Number(value || 0).toLocaleString('th-TH');

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[UI Crash Caught]:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <section className="panel" style={{ border: '1px solid #ef4444', background: '#201215', padding: 24, borderRadius: 12, margin: '20px auto', maxWidth: 600 }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 10px' }}>เกิดข้อผิดพลาดในการแสดงผล</h2>
          <p style={{ color: '#cbd5e1', fontSize: 14 }}>{this.state.error?.message || 'เกิดข้อผิดพลาดภายในหน้านี้'}</p>
          <button className="button primary compact" style={{ marginTop: 12 }} onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
            โหลดหน้านี้ใหม่
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
const formatDate = (value) => value ? new Date(value).toLocaleDateString('th-TH') : '-';

function parseThaiDateTime(date, time) {
  if (!date || !time) return new Date();
  const parts = String(time).split(':');
  const h = String(parts[0] || '0').padStart(2, '0');
  const m = String(parts[1] || '00').slice(0, 2).padStart(2, '0');
  return new Date(`${date}T${h}:${m}:00+07:00`);
}

function formatThaiTime(time) {
  if (!time) return '--:--';
  const parts = String(time).split(':');
  const h = String(parts[0] || '0').padStart(2, '0');
  const m = String(parts[1] || '00').slice(0, 2).padStart(2, '0');
  return `${h}:${m}`;
}

const VEHICLE_TYPES = [
  'รถเก๋ง (Sedan)',
  'รถกระบะ (Pickup)',
  'รถสปอร์ต (Sport)',
  'รถตู้ (Van)',
  'รถอเนกประสงค์ (SUV)'
];

const LINE_LOGIN_CLIENT_ID = '2011816169';
function redirectToLine(state = 'login') {
  const redirectUri = window.location.origin;
  const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_LOGIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid&bot_prompt=aggressive`;
  window.location.href = url;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      localStorage.token = result.token;
      localStorage.user = JSON.stringify(result.user);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof TypeError
        ? 'เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจสอบว่าเปิด backend ที่พอร์ต 3000 แล้ว'
        : err.message);
    }
  }

  const update = (name) => (event) => setForm({ ...form, [name]: event.target.value });

  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <div style={{ marginBottom: 16, display: 'inline-block' }}>
            <img src="/logo.png" alt="Parking Logo" style={{ width: 68, height: 68, borderRadius: 16, objectFit: 'cover', boxShadow: '0 0 30px rgba(32, 135, 255, 0.4), 0 8px 18px rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.2)' }} />
          </div>
          <span className="login-badge">SMART IOT PARKING</span>
          <h1>ระบบจัดการที่จอดรถ</h1>
          <p>ตรวจสอบสถานะช่องจอดแบบเรียลไทม์ จองล่วงหน้า พร้อมระบบควบคุมไม้กั้น</p>
          <div className="login-features">
            <div className="feature-item"><span>•</span> ตรวจจับสถานะว่าง/มีรถจอดเรียลไทม์</div>
            <div className="feature-item"><span>•</span> ไม้กั้นประจำช่องอัตโนมัติ 12 จุด</div>
            <div className="feature-item"><span>•</span> แจ้งเตือนเวลาจอดและรับสลิปผ่าน LINE</div>
          </div>
        </div>

        <div className="login-card-wrap">
          <form className="login-card" onSubmit={submit}>
            <div className="login-tabs">
              <button
                type="button"
                className={`login-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => { setMode('login'); setError(''); }}
              >
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                className={`login-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => { setMode('register'); setError(''); }}
              >
                สมัครสมาชิก
              </button>
            </div>

            <div className="login-card-header">
              <h2>{mode === 'login' ? 'ยินดีต้อนรับ' : 'สร้างบัญชีใหม่'}</h2>
              <p className="muted">{mode === 'login' ? 'กรอกข้อมูลเพื่อเข้าสู่ระบบจัดการที่จอดรถ' : 'กรอกข้อมูลเพื่อเริ่มต้นใช้งานระบบ Smart Parking'}</p>
            </div>

            {mode === 'register' && (
              <label>
                ชื่อ-นามสกุล / ชื่อที่แสดง
                <input required placeholder="เช่น สมชาย ใจดี" onChange={update('name')} />
              </label>
            )}
            <label>
              ชื่อผู้ใช้หรืออีเมล
              <input required placeholder="username หรือ email" onChange={update('username')} />
            </label>
            {mode === 'register' && (
              <label>
                อีเมล
                <input type="email" placeholder="name@example.com" onChange={update('email')} />
              </label>
            )}
            <label>
              รหัสผ่าน
              <input required type="password" placeholder="••••••••" onChange={update('password')} />
            </label>

            {error && <div className="alert error">{error}</div>}

            <button className="button primary full login-submit-btn">
              {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>

            <div className="line-login-divider"><span>หรือเข้าสู่ระบบด้วย</span></div>

            <button type="button" className="button line-button full" onClick={() => redirectToLine('login')}>
              <span className="line-icon-badge" style={{ width: 28, height: 28, borderRadius: 6 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffffff">
                  <path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324s-9.365 3.281-9.365 7.324c0 3.621 3.222 6.657 7.764 7.219.303.066.715.2.818.458.093.235.061.602.03.841l-.133.799c-.04.24-.185.938.822.512 1.007-.426 5.432-3.199 7.411-5.477 1.34-1.442 2.018-2.91 2.018-4.352zm-12.872 1.95h-.898a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382zm2.086 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382h-.898zm4.512 0a.382.382 0 0 1-.382-.382v-1.637l-1.693 2.019h-.441a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v1.637l1.693-2.019h.441a.382.382 0 0 1 .382.382v2.738a.382.382 0 0 1-.382.382h-.898zm2.67 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h1.996c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.098v.481h.898c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-.898v.481h1.098c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.996z" />
                </svg>
              </span>
              <span>เข้าสู่ระบบด้วย LINE</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function LineConnectModal({ user, onClose, notify, reload }) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const handleCopyCode = () => {
    if (user?.line_link_code) {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(user.line_link_code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        });
      } else {
        const ta = document.createElement('textarea');
        ta.value = user.line_link_code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleTestMessage = async () => {
    setTesting(true);
    try {
      await api('/auth/line/test-message', { method: 'POST' });
      notify?.('ส่งข้อความทดสอบเข้า LINE Bot สำเร็จแล้ว กรุณาเปิดดูในแอป LINE', false);
    } catch (e) {
      notify?.(e.message || 'ส่งข้อความทดสอบไม่สำเร็จ', true);
    } finally {
      setTesting(false);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('คุณต้องการยกเลิกการเชื่อมต่อบัญชี LINE ใช่หรือไม่?')) return;
    setUnlinking(true);
    try {
      await api('/auth/line/unlink', { method: 'POST' });
      notify?.('ยกเลิกการเชื่อมต่อ LINE เรียบร้อยแล้ว', false);
      reload?.();
      onClose();
    } catch (e) {
      notify?.(e.message || 'เกิดข้อผิดพลาดในการยกเลิก', true);
    } finally {
      setUnlinking(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(6, 10, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="booking-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          width: '100%',
          margin: 'auto',
          background: '#19212b',
          border: '1.5px solid #3a4758',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.85)',
          boxSizing: 'border-box',
          position: 'relative',
          color: '#f8fafc'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, color: '#f8fafc' }}>จัดการการเชื่อมต่อ LINE</h3>
            <span className="muted" style={{ fontSize: 12 }}>รับการแจ้งเตือนแบบเรียลไทม์ผ่านบอท @302ypwvm</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} style={{ fontSize: 22, cursor: 'pointer', background: 'none', border: 'none', color: '#94a3b8' }}>✕</button>
        </div>

        {user?.line_user_id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1.5px solid rgba(16, 185, 129, 0.4)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🟢</span>
                <strong style={{ color: '#34d399', fontSize: 15 }}>เชื่อมต่อ LINE สำเร็จแล้ว</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                บัญชีของคุณ (<strong>{user.name}</strong>) ได้เชื่อมโยงเข้ากับระบบเรียบร้อยแล้ว {user.role === 'admin' ? 'คุณจะได้รับแจ้งเตือนสถานะอุปกรณ์และข้อผิดพลาดของระบบอัตโนมัติ' : 'คุณจะได้รับแจ้งเตือนการจองและสรุปเวลาจอดอัตโนมัติ'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="https://line.me/R/ti/p/@302ypwvm"
                target="_blank"
                rel="noreferrer"
                className="button"
                style={{ background: '#06c755', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', padding: '10px 16px', borderRadius: 8 }}
              >
                <span>เปิดห้องแชท Bot (@302ypwvm)</span>
              </a>

              <button
                type="button"
                className="button secondary"
                onClick={handleTestMessage}
                disabled={testing}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, fontWeight: 600 }}
              >
                <span>{testing ? 'กำลังส่ง...' : 'ทดสอบส่งข้อความเข้า LINE มือถือ'}</span>
              </button>

              <button
                type="button"
                className="button danger compact"
                onClick={handleUnlink}
                disabled={unlinking}
                style={{ marginTop: 6, alignSelf: 'center', fontSize: 12 }}
              >
                {unlinking ? 'กำลังยกเลิก...' : 'ยกเลิกการเชื่อมต่อ LINE'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1.5px solid rgba(239, 68, 68, 0.35)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🔴</span>
                <strong style={{ color: '#f87171', fontSize: 15 }}>ยังไม่ได้เชื่อมต่อบัญชี LINE</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                {user?.role === 'admin'
                  ? 'กรุณาเชื่อมต่อ LINE เพื่อรับการแจ้งเตือนเร่งด่วนเมื่ออุปกรณ์ Offline, ไม้กั้นค้าง, หรือระบบมีเหตุผิดปกติ'
                  : 'กรุณาเชื่อมต่อ LINE เพื่อรับแจ้งเตือนเมื่อจองที่จอดรถ, เตือนก่อนหมดเวลา และสรุปค่าบริการอัตโนมัติ'}
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--cyan)', marginBottom: 8, fontSize: 13 }}>
                วิธีที่ 1: เชื่อมต่อทันทีด้วย LINE Login (แนะนำ)
              </div>
              <button
                type="button"
                className="button full"
                onClick={() => redirectToLine('link')}
                style={{ background: '#06c755', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer', border: 'none' }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#ffffff"><path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324s-9.365 3.281-9.365 7.324c0 3.621 3.222 6.657 7.764 7.219.303.066.715.2.818.458.093.235.061.602.03.841l-.133.799c-.04.24-.185.938.822.512 1.007-.426 5.432-3.199 7.411-5.477 1.34-1.442 2.018-2.91 2.018-4.352zm-12.872 1.95h-.898a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382zm2.086 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382h-.898zm4.512 0a.382.382 0 0 1-.382-.382v-1.637l-1.693 2.019h-.441a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v1.637l1.693-2.019h.441a.382.382 0 0 1 .382.382v2.738a.382.382 0 0 1-.382.382h-.898zm2.67 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h1.996c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.098v.481h.898c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-.898v.481h1.098c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.996z" /></svg>
                <span>กดเชื่อมต่อด้วย LINE Login</span>
              </button>
            </div>

            {user?.line_link_code && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 6, fontSize: 13 }}>
                  วิธีที่ 2: ผูกผ่าน LINE Chat Bot ด้วยรหัส
                </div>
                <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.6 }}>
                  1. แอดเพื่อนบอท: <a href="https://line.me/R/ti/p/@302ypwvm" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontWeight: 600 }}>@302ypwvm (Parking Alert Bot)</a><br />
                  2. ส่งรหัสเชื่อมโยงนี้ในแชทบอท:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, background: '#0f172a', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(56, 189, 248, 0.4)' }}>
                  <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, color: '#38bdf8', flex: 1 }}>{user.line_link_code}</code>
                  <button
                    type="button"
                    className="button compact"
                    onClick={handleCopyCode}
                    style={{ background: copied ? '#10b981' : '#334155', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 6 }}
                  >
                    {copied ? '✓ คัดลอกแล้ว' : 'คัดลอกรหัส'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
          <button type="button" className="button secondary" onClick={onClose} style={{ padding: '8px 16px' }}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Header({ user, onLogout, lastUpdated, data, setView, notify, reload }) {
  const [showLineModal, setShowLineModal] = useState(false);
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' })
    : '--:--:--';
  const activeAlerts = (data?.system_alerts || []).filter(a => a.status === 'active');
  const criticalCount = activeAlerts.filter(a => a.priority === 'CRITICAL').length;

  return <header className="topbar">
    <div className="brand">
      <img src="/logo.png" alt="Parking Logo" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 15px rgba(32, 135, 255, 0.35)', border: '1px solid rgba(255, 255, 255, 0.15)' }} />
      <div><strong>ระบบจัดการที่จอดรถ</strong><span>SMART PARKING · SUPABASE · ESP32</span></div>
    </div>
    <div className="user-menu">
      <span className="connection-pill live-pill"><span className="live-dot" />LIVE · {timeStr}</span>
      {user.role === 'admin' && activeAlerts.length > 0 && (
        <button
          type="button"
          className="button compact"
          style={{
            background: criticalCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            border: `1px solid ${criticalCount > 0 ? '#ef4444' : '#f59e0b'}`,
            color: criticalCount > 0 ? '#fca5a5' : '#fcd34d',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
            cursor: 'pointer'
          }}
          onClick={() => setView('alerts')}
          title="คลิกเพื่อดูรายการแจ้งเตือนทั้งหมด"
        >
          <span>{criticalCount > 0 ? '🔴' : '🟡'}</span>
          <span>{activeAlerts.length} แจ้งเตือน</span>
        </button>
      )}
      {user.role !== 'admin' && <span className={`badge credit-pill ${Number(user.credit || 0) > 0 ? 'available' : 'unavailable'}`}>เครดิต ฿{formatMoney(user.credit)}</span>}
      <button
        type="button"
        onClick={() => setShowLineModal(true)}
        className={`badge line-pill ${user.line_user_id ? 'available' : 'unavailable'}`}
        style={{
          cursor: 'pointer',
          border: user.line_user_id ? '1.5px solid rgba(16, 185, 129, 0.6)' : '1.5px solid rgba(239, 68, 68, 0.6)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 7,
          background: user.line_user_id ? 'rgba(19, 51, 36, 0.85)' : 'rgba(56, 22, 25, 0.85)',
          color: user.line_user_id ? '#34d399' : '#f87171',
          fontWeight: 600,
          fontFamily: 'inherit',
          transition: 'all 0.2s ease',
        }}
        title="คลิกเพื่อจัดการการเชื่อมต่อ LINE หรือดูรหัสผูกบัญชี"
      >
        <span style={{ fontSize: 11 }}>{user.line_user_id ? '🟢' : '🔴'}</span>
        <span>LINE {user.line_user_id ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</span>
      </button>
      <span className={`role ${user.role}`}>{user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้'}</span>
      <span className="avatar">{user.name?.slice(0, 1)}</span>
      <button className="button compact" onClick={onLogout}>ออกจากระบบ</button>
    </div>
    {showLineModal && (
      <LineConnectModal
        user={user}
        onClose={() => setShowLineModal(false)}
        notify={notify}
        reload={reload}
      />
    )}
  </header>;
}

function Sidebar({ user, view, setView, activeAlertCount = 0 }) {
  const items = user.role === 'admin'
    ? [
      ['dashboard', '▦', 'ภาพรวมการจอง'],
      ['analytics', '▤', 'สถิติการใช้งาน'],
      ['users', '♙', 'จัดการผู้ใช้'],
      ['devices', '⌁', 'อุปกรณ์ / ไม้กั้น'],
      ['alerts', activeAlertCount > 0 ? '🔴' : '●', `แจ้งเตือน & ข้อผิดพลาด${activeAlertCount > 0 ? ` (${activeAlertCount})` : ''}`],
      ['layout', '⊞', 'จัดการผังลานจอด']
    ]
    : [
      ['booking', 'P', 'จองที่จอดรถ'],
      ['control', '⌁', 'ควบคุมช่องจอด'],
      ['history', '▤', 'ประวัติของฉัน']
    ];
  return <aside className="sidebar">{items.map(([id, icon, label]) =>
    <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><span>{icon}</span>{label}</button>
  )}</aside>;
}

function PageHead({ title, description }) {
  return <div className="page-head"><h1>{title}</h1><p>{description}</p></div>;
}

function resolveSlotState(slot, devices) {
  const sensor = devices?.find((d) => d.type === 'sensor' && d.linked_slot === slot.id);
  const isCarPresent = sensor?.status === 'online' && (sensor?.presence === 'occupied' || sensor?.car_present === true);
  if (slot.status === 'unavailable') {
    return { status: 'unavailable', label: 'กำลังซ่อม', canBook: false, sensor, isCarPresent };
  }
  if (slot.status === 'booked') {
    return { status: 'booked', label: 'ถูกจอง', canBook: false, sensor, isCarPresent };
  }
  return { status: 'available', label: 'ว่าง', canBook: true, sensor, isCarPresent };
}

function StatCards({ slots, devices, bookings, user }) {
  const resolved = slots.map((s) => resolveSlotState(s, devices));
  const stats = [
    ['green', resolved.filter((s) => s.status === 'available').length, 'ช่องว่าง'],
    ['red', resolved.filter((s) => s.status === 'booked').length, 'ถูกจอง'],
    ['gray', resolved.filter((s) => s.status === 'unavailable').length, 'ไม่พร้อมใช้งาน / ซ่อม'],
    ['violet', `฿${formatMoney(20)}`, user?.role === 'admin' ? 'รายการจองทั้งหมด' : 'ราคาต่อชั่วโมง'],
  ];
  return <div className="stats">{stats.map(([color, value, label]) => <div className={`stat ${color}`} key={label}><strong>{user?.role === 'admin' && label === 'รายการจองทั้งหมด' ? bookings.length : value}</strong><span>{label}</span></div>)}</div>;
}

function getSlotTypeMeta(type) {
  const t = type || 'ลูกค้าทั่วไป';
  if (t === 'สมาชิก') return { label: 'สมาชิก', icon: '', className: 'member' };
  if (t === 'ผู้พิการ') return { label: 'ผู้พิการ', icon: '', className: 'disabled' };
  if (t === 'ชาร์จ EV') return { label: 'ชาร์จ EV', icon: '', className: 'ev' };
  if (t === 'ปกติ' || t === 'ลูกค้าทั่วไป') return { label: 'ลูกค้าทั่วไป', icon: '', className: 'general' };
  return { label: t, icon: '', className: 'general' };
}

function InteractiveFloorMap({ map, slots, devices, isAdmin, onSlotClick, onSlotMove, selectedSlotId }) {
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragPos, setDragPos] = useState(null);

  if (!map) return null;

  const handlePointerDown = (slot, event) => {
    if (!isAdmin) {
      onSlotClick?.(slot);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const pointerId = event.pointerId;
    const targetEl = event.currentTarget;
    if (targetEl && targetEl.setPointerCapture) {
      try { targetEl.setPointerCapture(pointerId); } catch (_) { }
    }

    const startX = event.clientX;
    const startY = event.clientY;
    let hasMoved = false;

    const handlePointerMove = (e) => {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 4 || dy > 4) {
        hasMoved = true;
        setDraggingId(slot.id);
        const rect = container.getBoundingClientRect();
        const curX = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
        const curY = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
        setDragPos({ id: slot.id, x: Number(curX.toFixed(1)), y: Number(curY.toFixed(1)) });
      }
    };

    const handlePointerUp = (e) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (targetEl && targetEl.releasePointerCapture) {
        try { targetEl.releasePointerCapture(pointerId); } catch (_) { }
      }
      setDraggingId(null);
      setDragPos(null);

      if (hasMoved) {
        const rect = container.getBoundingClientRect();
        const finalX = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
        const finalY = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
        onSlotMove?.(slot, Number(finalX.toFixed(1)), Number(finalY.toFixed(1)));
      } else {
        onSlotClick?.(slot);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const positionedSlots = slots.filter((s) => s.pos_x != null && s.pos_y != null);

  return (
    <div className="map-canvas-container" ref={containerRef}>
      <img src={map.image_url} alt={map.name} className="map-canvas-image" />
      {positionedSlots.map((slot) => {
        const isDragging = draggingId === slot.id;
        const posX = isDragging && dragPos ? dragPos.x : Number(slot.pos_x);
        const posY = isDragging && dragPos ? dragPos.y : Number(slot.pos_y);
        const { status, label, canBook, sensor, isCarPresent } = resolveSlotState(slot, devices);
        const typeMeta = getSlotTypeMeta(slot.type);
        const sensorDotClass = !sensor || sensor.status !== 'online' ? 'offline' : (isCarPresent ? 'occupied' : 'empty');
        const isSelected = selectedSlotId === slot.id;

        return (
          <div
            key={slot.id}
            className={`slot-pin ${status} ${isDragging ? 'dragging' : ''}`}
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              outline: isSelected ? '2px solid var(--cyan)' : 'none',
              cursor: isAdmin ? 'grab' : (canBook ? 'pointer' : 'not-allowed'),
              opacity: !isAdmin && !canBook ? 0.75 : 1
            }}
            onPointerDown={(e) => handlePointerDown(slot, e)}
            title={isAdmin ? `คลิกลากช่อง ${slot.code} ไปยังตำแหน่งบนผัง หรือคลิกเพื่อแก้ไข` : `${slot.code} (${label}) - ฿${slot.price_per_hour || 20}/ชม.`}
          >
            <div className="slot-pin-header">
              <span className="slot-pin-code" style={{ color: '#ffffff' }}>{slot.code}</span>
              <span className={`sensor-dot ${sensorDotClass}`} style={{ position: 'static', width: 7, height: 7 }} />
            </div>
            <div className="slot-pin-meta">
              {typeMeta.icon ? <span>{typeMeta.icon}</span> : null}
              <span className="slot-pin-price">฿{slot.price_per_hour || 20}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SlotGrid({ slots, devices, onSelect }) {
  return <div className="parking-lane"><div className="lane-label">↑ ทางเข้า &nbsp;/&nbsp; ทางออก</div><div className="slot-grid">{slots.map((slot) => {
    const { status, label, canBook, sensor, isCarPresent } = resolveSlotState(slot, devices);
    const sensorDotClass = !sensor || sensor.status !== 'online'
      ? 'offline'
      : (isCarPresent ? 'occupied' : 'empty');
    const sensorDotTitle = !sensor || sensor.status !== 'online'
      ? 'เซ็นเซอร์: ออฟไลน์'
      : (isCarPresent ? 'เซ็นเซอร์: ตรวจพบรถจอด (สีแดง)' : 'เซ็นเซอร์: ไม่มีรถจอด (สีเขียว)');
    const typeMeta = getSlotTypeMeta(slot.type);
    return <button type="button" className={`slot-card ${status}`} key={slot.id} disabled={!canBook} onClick={() => onSelect?.(slot)} aria-label={`${slot.code} ${label}`}>
      <span className={`sensor-dot ${sensorDotClass}`} title={sensorDotTitle} />
      <strong>{slot.code}</strong>
      <small>{label}</small>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span className={`slot-type-pill ${typeMeta.className}`}>{typeMeta.label}</span>
        <span style={{ fontSize: 11, color: '#facc15', fontWeight: 700 }}>฿{slot.price_per_hour || 20}/ชม.</span>
      </div>
    </button>;
  })}</div></div>;
}

function getInitialBookingTime() {
  const future = new Date(Date.now() + 15 * 60000);
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(future);
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(future);
  return { date: dateStr, time: timeStr, duration: 1 };
}

function UserBooking({ data, user, notify, setView }) {
  const [floor, setFloor] = useState(1);
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(getInitialBookingTime);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');

  const allFloorSlots = data.slots.filter((slot) => Number(slot.floor) === Number(floor)).sort((a, b) => a.slot_order - b.slot_order);
  const slots = typeFilter === 'all' ? allFloorSlots : allFloorSlots.filter((slot) => (slot.type || 'ลูกค้าทั่วไป') === typeFilter);
  const selectedRate = Number(selected?.price_per_hour || 20);
  const totalAmount = Number(booking.duration || 1) * selectedRate;
  const userCredit = Number(user?.credit || 0);
  const isInsufficient = userCredit < totalAmount;
  const activeMap = (data.parking_maps || []).find((item) => Number(item.floor) === Number(floor));

  const userVehicles = useMemo(() => (data.vehicles || []).filter((v) => v.user_id === user.id), [data.vehicles, user.id]);
  const defaultVehicle = useMemo(() => userVehicles.find((v) => v.is_default) || userVehicles[0] || null, [userVehicles]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [manualPlate, setManualPlate] = useState('');
  const [manualType, setManualType] = useState('รถเก๋ง (Sedan)');
  const [saveManualVehicle, setSaveManualVehicle] = useState(true);

  const handleSelectSlot = (slot) => {
    setSelected(slot);
    setModalError('');
    setBooking(getInitialBookingTime());
    const dVehicle = userVehicles.find((v) => v.is_default) || userVehicles[0];
    if (dVehicle) {
      setSelectedVehicleId(dVehicle.id);
      setManualPlate('');
    } else {
      setSelectedVehicleId('manual');
    }
  };

  const book = async (event) => {
    event.preventDefault();
    setModalError('');

    if (isInsufficient) {
      setModalError(`เครดิตของคุณไม่เพียงพอสำหรับการจอง (ต้องใช้ ฿${formatMoney(totalAmount)} แต่คุณมี ฿${formatMoney(userCredit)}) กรุณาขอเติมเครดิตก่อนทำรายการ`);
      return;
    }

    let vehiclePayload = {};
    if (selectedVehicleId && selectedVehicleId !== 'manual') {
      const chosen = userVehicles.find((v) => v.id === selectedVehicleId);
      if (chosen) {
        vehiclePayload = {
          vehicleId: chosen.id,
          licensePlate: chosen.license_plate,
          vehicleType: chosen.vehicle_type
        };
      }
    } else {
      const trimmed = manualPlate.trim();
      if (!trimmed) {
        setModalError('กรุณาระบุเลขทะเบียนรถยนต์');
        return;
      }
      vehiclePayload = {
        licensePlate: trimmed,
        vehicleType: manualType,
        saveVehicle: saveManualVehicle
      };
    }

    setSubmitting(true);
    try {
      await api('/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...booking, slotId: selected.id, ...vehiclePayload })
      });
      setSelected(null);
      setBooking(getInitialBookingTime());
      notify('จองที่จอดรถสำเร็จแล้ว!');
    } catch (err) {
      setModalError(err.message || 'จองไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead
        title="จองที่จอดรถ"
        description="เลือกช่องจอดที่ว่างเพื่อทำการจอง สถานะอัปเดตจากฐานข้อมูลและเซ็นเซอร์ ESP32"
      />
      <StatCards slots={data.slots} devices={data.devices} bookings={data.bookings} user={user} />
      <div className="floor-tabs">
        <button className={floor === 1 ? 'active' : ''} onClick={() => setFloor(1)}>ชั้น 1 (A1 - A6)</button>
        <button className={floor === 2 ? 'active' : ''} onClick={() => setFloor(2)}>ชั้น 2 (B1 - B6)</button>
      </div>

      {/* ตัวกรองประเภทช่องจอดและสลับโหมดผัง */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>ประเภทช่อง:</span>
        {['all', 'ลูกค้าทั่วไป', 'สมาชิก', 'ผู้พิการ'].map((t) => {
          const meta = t === 'all' ? { label: 'ทั้งหมด', icon: '' } : getSlotTypeMeta(t);
          return (
            <button
              key={t}
              type="button"
              className={`button compact ${typeFilter === t ? 'primary' : ''}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setTypeFilter(t)}
            >
              {meta.icon ? `${meta.icon} ` : ''}{meta.label}
            </button>
          );
        })}

        {activeMap && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`button compact ${viewMode === 'grid' ? 'primary' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              ▦ ตาราง
            </button>
            <button
              type="button"
              className={`button compact ${viewMode === 'map' ? 'primary' : ''}`}
              onClick={() => setViewMode('map')}
            >
              ผังแปลนจริง
            </button>
          </div>
        )}
      </div>

      <section className="panel parking-panel">
        <div className="panel-title">
          <h2>ผังช่องจอด · ชั้น {floor} ({floor === 1 ? 'A1 - A6' : 'B1 - B6'})</h2>
          <span className="muted">{slots.length} ช่อง</span>
        </div>

        {viewMode === 'map' && activeMap ? (
          <div>
            <InteractiveFloorMap
              map={activeMap}
              slots={allFloorSlots}
              devices={data.devices}
              isAdmin={false}
              onSlotClick={(s) => {
                const { canBook } = resolveSlotState(s, data.devices);
                if (canBook) handleSelectSlot(s);
              }}
              selectedSlotId={selected?.id}
            />
          </div>
        ) : (
          <SlotGrid slots={slots} devices={data.devices} onSelect={handleSelectSlot} />
        )}
        <div className="legend">
          <span><i className="available" />ว่าง (สีเขียว)</span>
          <span><i className="booked" />ถูกจอง (สีแดง)</span>
          <span><i className="unavailable" />ซ่อมบำรุง (สีเทา)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span className="sensor-dot empty" style={{ position: 'static', display: 'inline-block' }} />จุดเซ็นเซอร์: ว่าง
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="sensor-dot occupied" style={{ position: 'static', display: 'inline-block' }} />จุดเซ็นเซอร์: ตรวจพบวัตถุ
          </span>
        </div>
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <form className="booking-modal" onSubmit={book} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">RESERVE PARKING</p>
                <h2>จองช่อง {selected.code}</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <p className="muted">ชั้น {selected.floor} · {selected.type || 'ลูกค้าทั่วไป'} · ฿{selectedRate} ต่อชั่วโมง</p>

            {modalError && (
              <div className="alert error" style={{ margin: '14px 0 10px', fontSize: 13, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span>{modalError}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginTop: 10 }}>
              <label style={{ margin: 0 }}>
                วันที่จอง
                <input
                  required
                  type="date"
                  min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())}
                  value={booking.date || ''}
                  onChange={(event) => { setBooking({ ...booking, date: event.target.value }); setModalError(''); }}
                />
              </label>

              <label style={{ margin: 0 }}>
                เวลาเริ่ม
                <input
                  required
                  type="time"
                  value={booking.time || ''}
                  onChange={(event) => { setBooking({ ...booking, time: event.target.value }); setModalError(''); }}
                />
              </label>
            </div>

            <label style={{ marginTop: 10 }}>
              จำนวนชั่วโมง (ชั่วโมงละ ฿{selectedRate})
              <input
                required
                type="number"
                min="1"
                max="12"
                value={booking.duration}
                onChange={(event) => { setBooking({ ...booking, duration: Number(event.target.value) }); setModalError(''); }}
              />
            </label>

            {/* ส่วนเลือกรถยนต์ที่จะเข้าจอด */}
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>
                เลือกรถที่จะเข้าจอด <span style={{ color: '#f87171' }}>*</span>
              </label>
              {userVehicles.length > 0 ? (
                <>
                  <select
                    value={selectedVehicleId}
                    onChange={(event) => {
                      setSelectedVehicleId(event.target.value);
                      setModalError('');
                    }}
                    style={{ width: '100%', marginBottom: selectedVehicleId === 'manual' ? 8 : 0 }}
                  >
                    {userVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.license_plate} · {v.vehicle_type} {v.is_default ? '(คันหลัก)' : ''}
                      </option>
                    ))}
                    <option value="manual">+ ใช้รถคันอื่น / กรอกทะเบียนใหม่</option>
                  </select>
                  {selectedVehicleId === 'manual' && (
                    <div style={{
                      background: 'rgba(21, 28, 38, 0.7)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}>
                      <label style={{ fontSize: 12, margin: 0 }}>
                        เลขทะเบียนรถ
                        <input
                          type="text"
                          placeholder="เช่น 1กข 9999 หรือ กข 1234 กทม."
                          value={manualPlate}
                          onChange={(e) => { setManualPlate(e.target.value); setModalError(''); }}
                          required
                        />
                      </label>
                      <label style={{ fontSize: 12, margin: 0 }}>
                        ชนิดรถยนต์
                        <select value={manualType} onChange={(e) => setManualType(e.target.value)}>
                          {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', margin: '2px 0 0' }}>
                        <input
                          type="checkbox"
                          checked={saveManualVehicle}
                          onChange={(e) => setSaveManualVehicle(e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        <span>บันทึกรถคันนี้ไว้ในรายการยานพาหนะของฉัน</span>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  background: 'rgba(21, 28, 38, 0.7)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <label style={{ fontSize: 12, margin: 0 }}>
                    เลขทะเบียนรถ
                    <input
                      type="text"
                      placeholder="เช่น 1กข 9999 หรือ กข 1234 กทม."
                      value={manualPlate}
                      onChange={(e) => { setManualPlate(e.target.value); setModalError(''); }}
                      required
                    />
                  </label>
                  <label style={{ fontSize: 12, margin: 0 }}>
                    ชนิดรถยนต์
                    <select value={manualType} onChange={(e) => setManualType(e.target.value)}>
                      {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', margin: '2px 0 0' }}>
                    <input
                      type="checkbox"
                      checked={saveManualVehicle}
                      onChange={(e) => setSaveManualVehicle(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <span>บันทึกรถคันนี้ไว้ในรายการยานพาหนะของฉัน</span>
                  </label>
                </div>
              )}
            </div>

            {/* นโยบายการยกเลิก */}
            <div style={{
              marginTop: 10,
              background: 'rgba(54, 220, 201, 0.08)',
              border: '1px solid rgba(54, 220, 201, 0.25)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 11.5,
              lineHeight: 1.45,
              color: '#94a3b8'
            }}>
              <strong style={{ color: 'var(--cyan)', display: 'block', marginBottom: 2 }}>ℹ️ นโยบายการยกเลิกการจอง:</strong>
              ยกเลิกและรับเงินคืนเต็มจำนวนได้ทุกเมื่อ <strong>จนถึงก่อนเวลาเริ่มจอง 15 นาที</strong>
            </div>

            {/* Credit & Fee Box */}
            <div className="booking-credit-summary" style={{
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 10,
              background: isInsufficient ? 'rgba(239, 68, 68, 0.08)' : 'rgba(21, 33, 38, 0.85)',
              border: `1px solid ${isInsufficient ? 'rgba(239, 68, 68, 0.35)' : 'rgba(48, 66, 82, 0.8)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 13 }}>ยอดที่ต้องชำระ ({booking.duration || 1} ชม.)</span>
                <strong style={{ color: 'var(--cyan)', font: '700 20px "JetBrains Mono"' }}>฿{formatMoney(totalAmount)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 13 }}>เครดิตคงเหลือของคุณ</span>
                <strong style={{ color: isInsufficient ? '#f87171' : '#34d399', font: '700 17px "JetBrains Mono"' }}>
                  ฿{formatMoney(userCredit)}
                </strong>
              </div>

              {isInsufficient ? (
                <div style={{
                  marginTop: 4,
                  paddingTop: 10,
                  borderTop: '1px dashed rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <span style={{ color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                    🔴 เครดิตไม่เพียงพอ (ขาดอีก ฿{formatMoney(totalAmount - userCredit)})
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    ต้องมีเครดิตอย่างน้อย ฿{formatMoney(totalAmount)} จึงจะสามารถยืนยันการจองได้
                  </span>
                </div>
              ) : (
                <div style={{
                  marginTop: 2,
                  paddingTop: 8,
                  borderTop: '1px dashed rgba(52, 211, 153, 0.25)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  color: '#34d399'
                }}>
                  <span>✓ เครดิตเพียงพอสำหรับการจอง</span>
                  <span style={{ color: 'var(--muted)' }}>คงเหลือหลังจอง ฿{formatMoney(userCredit - totalAmount)}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              {isInsufficient ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="button primary full"
                    onClick={() => {
                      setSelected(null);
                      setView?.('history');
                    }}
                  >
                    ไปที่หน้าขอเติมเครดิต
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setSelected(null)}
                  >
                    ปิด
                  </button>
                </div>
              ) : (
                <button className="button primary full" disabled={submitting}>
                  {submitting ? 'กำลังบันทึกการจอง...' : 'ยืนยันการจอง'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function UserControl({ data, user, notify }) {
  const RATE_PER_HOUR = 20;
  const bookings = data.bookings.filter((item) => item.user_id === user.id && ['pending', 'active'].includes(item.status));
  const cards = bookings.map((booking) => {
    const slot = data.slots.find((s) => s.id === booking.slot_id);
    const device = data.devices.find((d) => d.type === 'barrier' && d.linked_slot === booking.slot_id);
    const now = new Date();
    const start = parseThaiDateTime(booking.date, booking.time);
    const endTime = new Date(start.getTime() + Number(booking.duration) * 3600000);
    const cancelCutoff = new Date(start.getTime() - 15 * 60 * 1000);
    const minutesUntilStart = (start.getTime() - now.getTime()) / 60000;
    const minutesSinceStart = (now.getTime() - start.getTime()) / 60000;
    const isNoShowExpired = booking.status === 'pending' && minutesSinceStart >= 15;
    const canCancel = booking.status === 'pending' && minutesUntilStart >= 15;
    const startTimeStr = formatThaiTime(booking.time);
    const endTimeStr = endTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    const cutoffTimeStr = cancelCutoff.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    const minutesLeft = (endTime - now) / 60000;
    const isOvertime = now > endTime;
    // คำนวณ overtime แบบ ceiling per hour (เกิน 1 นาที = คิด 1 ชม.) ตามราคาของช่องนั้นๆ
    const overtimeMinutes = isOvertime ? Math.max(0, Math.ceil((now - endTime) / 60000)) : 0;
    const overtimeHours = overtimeMinutes > 0 ? Math.ceil(overtimeMinutes / 60) : 0;
    const slotRate = Number(slot?.price_per_hour || RATE_PER_HOUR);
    const overtimeCost = overtimeHours * slotRate;
    return {
      booking,
      slot,
      device,
      now,
      start,
      endTime,
      cancelCutoff,
      minutesUntilStart,
      minutesSinceStart,
      isNoShowExpired,
      canCancel,
      startTimeStr,
      endTimeStr,
      cutoffTimeStr,
      minutesLeft,
      isOvertime,
      overtimeMinutes,
      overtimeHours,
      overtimeCost
    };
  });

  async function toggle(device) {
    try {
      await api(`/devices/${device.id}/toggle`, { method: 'POST' });
      notify(`สั่ง${device.state === 'open' ? 'ปิด' : 'เปิด'}ไม้กั้นช่องจอดแล้ว`);
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function cancelBooking(booking) {
    const confirmMsg = `ยืนยันการยกเลิกการจองช่อง ${booking.slot_id} หรือไม่?\n\nระบบจะคืนเครดิต ฿${formatMoney(booking.amount)} เข้าบัญชีของคุณทันที`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await api(`/bookings/${booking.id}/cancel`, { method: 'POST' });
      notify(`ยกเลิกการจองช่อง ${booking.slot_id} สำเร็จ! คืนเครดิต ฿${formatMoney(booking.amount)} เรียบร้อยแล้ว`);
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function finishBooking(booking) {
    if (!window.confirm(`ยืนยันการจบการจอดช่อง ${booking.slot_id} หรือไม่? ระบบจะคำนวณค่าบริการและส่งสลิปให้คุณ`)) return;
    try {
      await api(`/bookings/${booking.id}/finish`, { method: 'POST' });
      notify(`จบการจอดช่อง ${booking.slot_id} สำเร็จ สรุปยอดและรับสลิปเรียบร้อย`);
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <>
      <PageHead
        title="ควบคุมช่องจอด"
        description="ควบคุมไม้กั้นได้ตั้งแต่ 15 นาทีก่อนถึงเวลาจอง และยกเลิกการจองได้ทุกเมื่อก่อนถึงเวลาจอง 15 นาที"
      />
      <div className="slot-grid control-grid">
        {cards.length ? cards.map(({
          booking,
          slot,
          device,
          minutesUntilStart,
          minutesSinceStart,
          isNoShowExpired,
          canCancel,
          startTimeStr,
          endTimeStr,
          cutoffTimeStr,
          minutesLeft,
          isOvertime,
          overtimeMinutes,
          overtimeHours,
          overtimeCost
        }) => (
          <div className="slot-card booked control-card" key={booking.id}>
            <div className="slot-top">
              <strong>{slot?.code || booking.slot_id}</strong>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {device && (
                  <span className={`badge ${device.state === 'open' ? 'available' : 'unavailable'}`}>
                    {device.state === 'open' ? '🟢 ไม้กั้นเปิด' : '🔴 ไม้กั้นปิด'}
                  </span>
                )}
                <span className={`badge ${isOvertime ? 'unavailable' : booking.status === 'active' ? 'available' : 'pending'}`}>
                  {isOvertime ? '🔴 เกินเวลา' : booking.status === 'active' ? '🟢 กำลังจอด' : '🟡 รอเข้าจอด'}
                </span>
              </div>
            </div>

            {/* ข้อมูลเวลา */}
            <div style={{ marginTop: 8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>
                {booking.date} · {startTimeStr} - {endTimeStr} น.
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                ระยะเวลาจอง: {booking.duration} ชม. · ยอดที่ชำระ: ฿{formatMoney(booking.amount)}
              </div>
              {booking.license_plate && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{
                    background: 'rgba(54, 220, 201, 0.1)',
                    border: '1px solid rgba(54, 220, 201, 0.25)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                    color: 'var(--cyan)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600
                  }}>
                    {booking.license_plate}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    ({booking.vehicle_type || 'รถเก๋ง (Sedan)'})
                  </span>
                </div>
              )}
            </div>

            {/* สถานะกรณีรอเข้าจอด (pending) */}
            {booking.status === 'pending' && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {minutesUntilStart > 0 ? (
                  <small style={{ color: '#38bdf8', display: 'block', fontWeight: 500 }}>
                    จะถึงเวลาเริ่มจองในอีก {Math.ceil(minutesUntilStart)} นาที
                  </small>
                ) : minutesSinceStart < 15 ? (
                  <div style={{
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12
                  }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600 }}>
                      ถึงเวลาเริ่มจองแล้ว! กรุณานำรถเข้าจอด
                    </div>
                    <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 11 }}>
                      เหลือเวลาอีก {Math.ceil(15 - minutesSinceStart)} นาที หากเกิน 15 นาทีระบบจะตัดเป็น No-Show ปิดไม้กั้น และคืนช่องว่าง
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12
                  }}>
                    <div style={{ color: '#f87171', fontWeight: 600 }}>
                      🔴 หมดเวลาเข้าจอด (No-Show เกิน 15 นาที)
                    </div>
                    <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 11 }}>
                      ระบบตัดสิทธิ์การควบคุม ปิดไม้กั้น และคืนสถานะช่องจอดเป็น "ว่าง" เรียบร้อยแล้ว
                    </div>
                  </div>
                )}

                {canCancel ? (
                  <div style={{
                    background: 'rgba(52, 211, 153, 0.08)',
                    border: '1px solid rgba(52, 211, 153, 0.28)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12
                  }}>
                    <div style={{ color: '#34d399', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>✓ ยกเลิกได้ทุกเมื่อ</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>ถึง {cutoffTimeStr} น.</span>
                    </div>
                    <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 11 }}>
                      ยกเลิกก่อนเวลาจอง 15 นาที ระบบจะคืนเครดิตเต็มจำนวน ฿{formatMoney(booking.amount)}
                    </div>
                    <button
                      type="button"
                      className="button danger compact full"
                      style={{ marginTop: 8 }}
                      onClick={() => cancelBooking(booking)}
                    >
                      ยกเลิกการจอง (คืนเครดิต ฿{formatMoney(booking.amount)})
                    </button>
                  </div>
                ) : !isNoShowExpired ? (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12
                  }}>
                    <div style={{ color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>หมดเวลายกเลิกการจอง</span>
                    </div>
                    <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 11 }}>
                      เหลือน้อยกว่า 15 นาทีก่อนถึงเวลาจอง ({startTimeStr} น.) จึงไม่สามารถยกเลิกได้
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* สถานะกรณีจอดอยู่ (active) */}
            {booking.status === 'active' && (
              <div style={{ marginTop: 10 }}>
                {isOvertime ? (
                  <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                    <div style={{ color: '#f87171', fontWeight: 'bold', marginBottom: 4 }}>🔴 เกินเวลาจอด {overtimeMinutes} นาที</div>
                    <div style={{ color: 'var(--muted)' }}>ค่าจอดเพิ่มเติม: <strong style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 'normal' }}>{overtimeCost.toLocaleString('th-TH')}฿</strong> (คิด {overtimeHours} ชม. × ฿{slot?.price_per_hour || RATE_PER_HOUR})</div>
                    <div style={{ color: 'var(--muted)', marginTop: 2 }}>กดจบการจอดเพื่อหยุดคิดเงินและรับสลิป</div>
                  </div>
                ) : minutesLeft <= 15 && minutesLeft > 0 ? (
                  <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#fbbf24' }}>
                    🟡 ใกล้หมดเวลา เหลือ {Math.ceil(minutesLeft)} นาที
                  </div>
                ) : (
                  <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#38bdf8' }}>
                    🟢 กำลังจอด เหลือเวลา {Math.ceil(minutesLeft)} นาที
                  </div>
                )}

                <button
                  type="button"
                  className="button secondary compact full"
                  style={{ marginTop: 8 }}
                  onClick={() => finishBooking(booking)}
                >
                  จบการจอด (รับสลิปสรุปค่าบริการ)
                </button>
              </div>
            )}

            {/* อุปกรณ์ควบคุมไม้กั้น */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <small style={{ color: device ? (device.status === 'online' ? 'var(--cyan)' : 'var(--muted)') : 'var(--muted)' }}>
                  {device ? `⌁ ${device.name} · ${device.status === 'online' ? 'ออนไลน์' : 'ออฟไลน์'}` : 'ยังไม่ได้ผูกอุปกรณ์ควบคุมกับช่องนี้'}
                </small>
              </div>

              {device && (
                <div style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  marginBottom: 8,
                  background: device.state === 'open' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${device.state === 'open' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>สถานะไม้กั้น:</span>
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: device.state === 'open' ? 'var(--green)' : '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}>
                    {device.state === 'open' ? '🟢 เปิดอยู่ (ยกขึ้น)' : '🔴 ปิดอยู่ (กั้นช่อง)'}
                  </span>
                </div>
              )}

              {device && (
                isNoShowExpired ? (
                  <button className="button full" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    ตัดการควบคุมแล้ว (No-Show เกิน 15 นาที)
                  </button>
                ) : canCancel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      className="button full"
                      disabled
                      style={{
                        opacity: 0.75,
                        cursor: 'not-allowed',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--muted)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>ควบคุมไม้กั้นได้เมื่อถึง 15 นาทีก่อนเวลาจอง</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                        (เปิดให้ควบคุมได้ตั้งแต่ {cutoffTimeStr} น. เป็นต้นไป)
                      </span>
                    </button>
                  </div>
                ) : (
                  <button
                    className={`button full ${device.state === 'open' ? 'danger' : 'primary'}`}
                    onClick={() => toggle(device)}
                  >
                    {device.state === 'open' ? 'สั่งปิดไม้กั้น' : 'สั่งเปิดไม้กั้น'}
                  </button>
                )
              )}
            </div>
          </div>
        )) : (
          <section className="panel">
            <p className="muted">ยังไม่มีรายการจองที่ควบคุมได้ กรุณาจองช่องจอดก่อน</p>
          </section>
        )}
      </div>
    </>
  );
}

function UserHistory({ data, user, notify }) {
  const [request, setRequest] = useState({ amount: '', reason: '' });
  const [vehicleModal, setVehicleModal] = useState(null); // 'add' | 'edit' | null
  const [vehicleForm, setVehicleForm] = useState({ license_plate: '', vehicle_type: 'รถเก๋ง (Sedan)', brand: '', model: '', color: '', is_default: false });
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);
  const [vehicleError, setVehicleError] = useState('');

  const myVehicles = useMemo(() => (data.vehicles || []).filter((v) => v.user_id === user.id), [data.vehicles, user.id]);
  const mine = data.bookings.filter((booking) => booking.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const requests = (data.credit_requests || []).filter((item) => item.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));

  function openAddVehicle() {
    setVehicleForm({
      license_plate: '',
      vehicle_type: 'รถเก๋ง (Sedan)',
      brand: '',
      model: '',
      color: '',
      is_default: myVehicles.length === 0
    });
    setVehicleError('');
    setVehicleModal('add');
  }

  function openEditVehicle(veh) {
    setVehicleForm({
      id: veh.id,
      license_plate: veh.license_plate,
      vehicle_type: veh.vehicle_type || 'รถเก๋ง (Sedan)',
      brand: veh.brand || '',
      model: veh.model || '',
      color: veh.color || '',
      is_default: Boolean(veh.is_default)
    });
    setVehicleError('');
    setVehicleModal('edit');
  }

  async function handleSaveVehicle(e) {
    e.preventDefault();
    setVehicleError('');
    const plate = vehicleForm.license_plate?.trim();
    if (!plate) return setVehicleError('กรุณากรอกเลขทะเบียนรถยนต์');
    setVehicleSubmitting(true);
    try {
      if (vehicleModal === 'add') {
        await api('/vehicles', {
          method: 'POST',
          body: JSON.stringify(vehicleForm)
        });
        notify('เพิ่มยานพาหนะสำเร็จแล้ว');
      } else {
        await api(`/vehicles/${vehicleForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify(vehicleForm)
        });
        notify('อัปเดตข้อมูลยานพาหนะแล้ว');
      }
      setVehicleModal(null);
    } catch (err) {
      setVehicleError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setVehicleSubmitting(false);
    }
  }

  async function handleSetDefaultVehicle(id) {
    try {
      await api(`/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_default: true })
      });
      notify('ตั้งเป็นรถคันหลักเรียบร้อยแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function handleDeleteVehicle(id, plate) {
    if (!window.confirm(`ยืนยันการลบรถทะเบียน "${plate}" ออกจากระบบ?`)) return;
    try {
      await api(`/vehicles/${id}`, { method: 'DELETE' });
      notify('ลบข้อมูลรถเรียบร้อยแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function action(id, type) {
    if (type === 'cancel' && !window.confirm('คุณต้องการยกเลิกการจองและรับคืนเครดิตเข้าบัญชีใช่หรือไม่?')) return;
    if (type === 'finish' && !window.confirm('ยืนยันจบการจอดและสรุปค่าบริการใช่หรือไม่?')) return;
    try {
      await api(`/bookings/${id}/${type}`, { method: 'POST' });
      notify(type === 'cancel' ? 'ยกเลิกการจองและคืนเครดิตแล้ว' : 'จบการจอดแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function submitCredit(event) {
    event.preventDefault();
    const amount = Number(request.amount);
    if (!amount || amount < 10) return notify('กรุณาระบุจำนวนเงินอย่างน้อย ฿10', true);
    if (amount > 5000) return notify('เติมเครดิตได้ไม่เกินครั้งละ ฿5,000', true);
    if (amount % 10 !== 0) return notify('จำนวนเงินต้องเพิ่มทีละ 10 บาท', true);
    try {
      await api('/credit-requests', {
        method: 'POST',
        body: JSON.stringify({ amount, reason: request.reason?.trim() || 'ขอเติมเครดิต' })
      });
      setRequest({ amount: '', reason: '' });
      notify('ส่งคำขอเติมเครดิตแล้ว รอผู้ดูแลอนุมัติ');
    } catch (err) {
      notify(err.message, true);
    }
  }
  return <><PageHead title="ประวัติของฉัน" description="รายการจอง เครดิต และสถานะการใช้งานทั้งหมดของคุณ" />
    <section className={`panel line-connect-panel ${user.line_user_id ? 'is-linked' : 'is-unlinked'}`}>
      <div className="line-panel-inner">
        <div className="line-panel-info">
          <div className="line-avatar-wrap">
            <div className={`line-status-avatar ${user.line_user_id ? 'online' : 'offline'}`}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324s-9.365 3.281-9.365 7.324c0 3.621 3.222 6.657 7.764 7.219.303.066.715.2.818.458.093.235.061.602.03.841l-.133.799c-.04.24-.185.938.822.512 1.007-.426 5.432-3.199 7.411-5.477 1.34-1.442 2.018-2.91 2.018-4.352zm-12.872 1.95h-.898a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382zm2.086 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382h-.898zm4.512 0a.382.382 0 0 1-.382-.382v-1.637l-1.693 2.019h-.441a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v1.637l1.693-2.019h.441a.382.382 0 0 1 .382.382v2.738a.382.382 0 0 1-.382.382h-.898zm2.67 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h1.996c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.098v.481h.898c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-.898v.481h1.098c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.996z" /></svg>
            </div>
          </div>
          <div className="line-panel-texts">
            <div className="line-panel-header">
              <h2>{user.line_user_id ? 'เชื่อมต่อ LINE สำเร็จ' : 'การแจ้งเตือนผ่าน LINE'}</h2>
              <span className={`badge ${user.line_user_id ? 'available' : 'unavailable'}`}>
                {user.line_user_id ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
              </span>
            </div>
            <p className="line-panel-desc">
              {user.line_user_id
                ? 'ระบบผูกกับบัญชี LINE ของคุณและบอท Parking Alert Bot (@302ypwvm) แล้ว คุณจะได้รับแจ้งเตือนการจอง สรุปเวลาจอด และค่าบริการ'
                : 'เชื่อมต่อบัญชีเพื่อรับการแจ้งเตือนทันทีเมื่อจองที่จอดรถ, เตือนก่อนหมดเวลา 15 นาที และส่งสรุปค่าบริการอัตโนมัติ'}
            </p>
          </div>
        </div>
        <div className="line-panel-cta">
          {user.line_user_id ? (
            <div className="line-linked-buttons">
              <a href="https://line.me/R/ti/p/@302ypwvm" target="_blank" rel="noreferrer" className="button secondary">
                เปิดห้องแชท Bot
              </a>
              <button type="button" className="button compact secondary" onClick={async () => {
                try {
                  await api('/auth/line/test-message', { method: 'POST' });
                  notify('ส่งข้อความทดสอบเข้า LINE Bot สำเร็จแล้ว กรุณาเปิดดูใน LINE');
                } catch (e) {
                  notify(e.message, true);
                }
              }}>
                เทสระบบแจ้งเตือน
              </button>
              <button type="button" className="button danger compact" onClick={async () => {
                if (!window.confirm('คุณต้องการยกเลิกการเชื่อมต่อ LINE ใช่หรือไม่?')) return;
                try {
                  await api('/auth/line/unlink', { method: 'POST' });
                  notify('ยกเลิกการเชื่อมต่อ LINE แล้ว');
                } catch (e) {
                  notify(e.message, true);
                }
              }}>
                ยกเลิกการเชื่อมต่อ
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="button line-button large" onClick={() => redirectToLine('link')}>
                <span className="line-icon-badge">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#ffffff"><path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324s-9.365 3.281-9.365 7.324c0 3.621 3.222 6.657 7.764 7.219.303.066.715.2.818.458.093.235.061.602.03.841l-.133.799c-.04.24-.185.938.822.512 1.007-.426 5.432-3.199 7.411-5.477 1.34-1.442 2.018-2.91 2.018-4.352zm-12.872 1.95h-.898a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382zm2.086 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v2.738a.382.382 0 0 1-.382.382h-.898zm4.512 0a.382.382 0 0 1-.382-.382v-1.637l-1.693 2.019h-.441a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h.898c.211 0 .382.171.382.382v1.637l1.693-2.019h.441a.382.382 0 0 1 .382.382v2.738a.382.382 0 0 1-.382.382h-.898zm2.67 0a.382.382 0 0 1-.382-.382v-2.738c0-.211.171-.382.382-.382h1.996c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.098v.481h.898c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-.898v.481h1.098c.211 0 .382.171.382.382v.457a.382.382 0 0 1-.382.382h-1.996z" /></svg>
                </span>
                <span>เชื่อมต่อ LINE ของคุณ</span>
              </button>
              <span className="line-cta-subtext">เพิ่มเพื่อนบอท @302ypwvm อัตโนมัติ</span>
              {user.line_link_code && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>หรือแอดไลน์ <strong>@302ypwvm</strong> แล้วส่งรหัส:</span>
                  <strong style={{ color: 'var(--cyan)', background: 'rgba(54, 220, 201, 0.1)', padding: '2px 8px', borderRadius: 6, letterSpacing: 1 }}>{user.line_link_code}</strong>
                  <button
                    type="button"
                    className="button compact secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => {
                      if (navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(user.line_link_code).then(() => notify?.('คัดลอกรหัสแล้ว', false));
                      }
                    }}
                  >
                    คัดลอก
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2 style={{ margin: 0 }}>ยานพาหนะของฉัน</h2>
          <span className="muted" style={{ fontSize: 13 }}>{myVehicles.length} คันในระบบ</span>
        </div>
        <button type="button" className="button primary compact" onClick={openAddVehicle}>
          + เพิ่มรถยนต์
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        บันทึกข้อมูลป้ายทะเบียนและชนิดรถยนต์ของคุณ เพื่อความสะดวก รวดเร็ว และแม่นยำในการจองที่จอดรถ
      </p>

      {myVehicles.length > 0 ? (
        <div className="vehicle-grid">
          {myVehicles.map((v) => (
            <div className={`vehicle-card ${v.is_default ? 'is-default' : ''}`} key={v.id}>
              <div className="vehicle-header">
                <span className="vehicle-plate">{v.license_plate}</span>
                {v.is_default ? (
                  <span className="badge available">⭐ คันหลัก</span>
                ) : (
                  <button
                    type="button"
                    className="button compact secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => handleSetDefaultVehicle(v.id)}
                    title="ตั้งเป็นรถคันหลักสำหรับเลือกจองอัตโนมัติ"
                  >
                    ตั้งเป็นคันหลัก
                  </button>
                )}
              </div>
              <div className="vehicle-type">
                {v.vehicle_type || 'รถเก๋ง (Sedan)'}
              </div>
              {(v.brand || v.model || v.color) && (
                <div className="vehicle-meta">
                  {v.brand && <span>ยี่ห้อ: {v.brand}</span>}
                  {v.model && <span>รุ่น: {v.model}</span>}
                  {v.color && <span>สี: {v.color}</span>}
                </div>
              )}
              <div className="vehicle-actions">
                <button
                  type="button"
                  className="button compact secondary"
                  onClick={() => openEditVehicle(v)}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="button compact danger"
                  onClick={() => handleDeleteVehicle(v.id, v.license_plate)}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '24px 16px',
          color: 'var(--muted)',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 8,
          border: '1px dashed var(--border)'
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>ยังไม่มีข้อมูลยานพาหนะที่บันทึกไว้</p>
          <button type="button" className="button secondary compact" onClick={openAddVehicle}>
            + กดเพิ่มรถยนต์ของคุณตอนนี้
          </button>
        </div>
      )}
    </section>
    <section className="panel">
      <div className="panel-title">
        <h2>ขอเติมเครดิต</h2>
        <span className="muted">เครดิตปัจจุบัน <strong>฿{formatMoney(user.credit)}</strong></span>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        กรอกจำนวนเงินและรายละเอียดการชำระเงินเพื่อส่งให้ผู้ดูแลระบบตรวจสอบและอนุมัติเครดิตเข้าบัญชีของคุณ
      </p>
      <form className="booking-fields" onSubmit={submitCredit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="credit-form-row">
            <input
              type="number"
              min="10"
              max="5000"
              step="10"
              required
              placeholder="จำนวนเงิน (บาท)"
              value={request.amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setRequest({ ...request, amount: '' });
                } else {
                  const num = Number(val);
                  setRequest({ ...request, amount: num > 5000 ? 5000 : num });
                }
              }}
              className="credit-amount-input"
            />
            <input
              className="credit-reason-input"
              placeholder="เหตุผล / หลักฐาน (ไม่บังคับ เช่น โอนผ่าน PromptPay)"
              value={request.reason}
              onChange={(e) => setRequest({ ...request, reason: e.target.value })}
            />
            <button className="button primary credit-submit-btn">ส่งคำขอเติมเครดิต</button>
          </div>

          <div className="quick-chips">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>เลือกยอดด่วน:</span>
            {[50, 100, 200, 500, 1000].map((val) => (
              <button
                key={val}
                type="button"
                className="button compact"
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  background: Number(request.amount) === val ? 'rgba(54, 220, 201, 0.15)' : 'var(--surface2)',
                  borderColor: Number(request.amount) === val ? 'var(--cyan)' : 'var(--border)',
                  color: Number(request.amount) === val ? 'var(--cyan)' : '#eaf0f7'
                }}
                onClick={() => setRequest({ ...request, amount: val })}
              >
                ฿{val.toLocaleString('th-TH')}
              </button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
              * ปรับทีละ ฿10 · สูงสุดไม่เกิน ฿5,000 ต่อครั้ง
            </span>
          </div>
        </div>
      </form>
      {requests.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table>
            <thead>
              <tr><th>จำนวน</th><th>รายละเอียด</th><th>สถานะ</th><th>วันที่ขอ</th></tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id}>
                  <td><strong>฿{formatMoney(item.amount)}</strong></td>
                  <td>{item.reason}</td>
                  <td>
                    <span className={`badge ${item.status === 'approved' ? 'available' : item.status === 'rejected' ? 'unavailable' : 'pending'}`}>
                      {item.status === 'approved' ? '🟢 อนุมัติแล้ว' : item.status === 'rejected' ? '🔴 ปฏิเสธ' : '🟡 รออนุมัติ'}
                    </span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
    <section className="panel"><div className="panel-title"><h2>รายการจองล่าสุด</h2><span className="muted">{mine.length} รายการ</span></div><div className="table-wrap"><table><thead><tr><th>ช่องจอด</th><th>ยานพาหนะ</th><th>วันเวลา</th><th>ระยะเวลา</th><th>ยอดเงิน</th><th>สถานะ</th><th /></tr></thead><tbody>{mine.map((booking) => {
      const start = parseThaiDateTime(booking.date, booking.time);
      const canCancel = booking.status === 'pending' && (start.getTime() - Date.now()) >= 15 * 60 * 1000;
      return <tr key={booking.id}><td>{booking.slot_id}</td><td>{booking.license_plate ? <div style={{ fontSize: 13 }}><strong style={{ color: '#fff', font: '600 13px "JetBrains Mono"' }}>{booking.license_plate}</strong><div style={{ fontSize: 11, color: 'var(--cyan)' }}>{booking.vehicle_type || 'รถเก๋ง (Sedan)'}</div></div> : <span className="muted">-</span>}</td><td>{booking.date} {formatThaiTime(booking.time)} น.</td><td>{booking.duration} ชั่วโมง</td><td>฿{formatMoney(booking.amount)}</td><td><span className={`badge ${booking.status}`}>{booking.status}</span></td><td>{['pending', 'active'].includes(booking.status) && <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><button type="button" className="button primary compact" onClick={() => action(booking.id, 'finish')}>จบการจอด (รับสลิป)</button>{booking.status === 'pending' && (canCancel ? <button type="button" className="button danger compact" onClick={() => action(booking.id, 'cancel')}>ยกเลิก (คืนเครดิต)</button> : <button type="button" className="button compact" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="เหลือน้อยกว่า 15 นาทีก่อนถึงเวลาจอง ไม่สามารถยกเลิกได้แล้ว">หมดเวลายกเลิก</button>)}</div>}</td></tr>;
    })}</tbody></table></div></section>

    {vehicleModal && (
      <div className="modal-backdrop" onMouseDown={() => setVehicleModal(null)}>
        <form className="booking-modal" onSubmit={handleSaveVehicle} onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <p className="eyebrow">{vehicleModal === 'add' ? 'ADD VEHICLE' : 'EDIT VEHICLE'}</p>
              <h2>{vehicleModal === 'add' ? 'เพิ่มยานพาหนะใหม่' : 'แก้ไขข้อมูลยานพาหนะ'}</h2>
            </div>
            <button type="button" className="modal-close" onClick={() => setVehicleModal(null)}>×</button>
          </div>
          <p className="muted">ระบุเลขทะเบียนและเลือกชนิดรถยนต์</p>

          {vehicleError && (
            <div className="alert error" style={{ margin: '14px 0 10px', fontSize: 13 }}>
              <span>{vehicleError}</span>
            </div>
          )}

          <label>
            เลขทะเบียนรถ <span style={{ color: '#f87171' }}>*</span>
            <input
              type="text"
              required
              placeholder="เช่น 1กข 9999 หรือ กข 1234 กทม."
              value={vehicleForm.license_plate}
              onChange={(e) => setVehicleForm({ ...vehicleForm, license_plate: e.target.value })}
            />
          </label>

          <label>
            ชนิดรถยนต์ <span style={{ color: '#f87171' }}>*</span>
            <select
              value={vehicleForm.vehicle_type}
              onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              ยี่ห้อ (ถ้ามี)
              <input
                type="text"
                placeholder="เช่น Toyota, Honda"
                value={vehicleForm.brand}
                onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
              />
            </label>
            <label>
              รุ่น (ถ้ามี)
              <input
                type="text"
                placeholder="เช่น Civic, Camry"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
              />
            </label>
          </div>

          <label>
            สีรถยนต์ (ถ้ามี)
            <input
              type="text"
              placeholder="เช่น ขาว, ดำ, เทา, บรอนซ์"
              value={vehicleForm.color}
              onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0' }}>
            <input
              type="checkbox"
              checked={vehicleForm.is_default}
              onChange={(e) => setVehicleForm({ ...vehicleForm, is_default: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <span style={{ fontSize: 13 }}>ตั้งเป็นรถคันหลัก (เลือกอัตโนมัติเมื่อทำการจอง)</span>
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="submit" className="button primary full" disabled={vehicleSubmitting}>
              {vehicleSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูลรถ'}
            </button>
            <button type="button" className="button" onClick={() => setVehicleModal(null)}>
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    )}</>;
}

function AdminDashboard({ data, setView }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const revenue = data.bookings.filter((booking) => booking.date === today && booking.status !== 'cancelled').reduce((sum, booking) => sum + Number(booking.amount || 0), 0);
  const bookings = [...data.bookings].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const userName = (id) => data.users.find((item) => item.id === id)?.name || id;
  return (
    <>
      <PageHead title="ภาพรวมและประวัติการจอง" description="ติดตามสถานะพื้นที่จอด ตรวจสอบรายการจองทั้งหมด และดูสถิติการใช้งาน" />
      <StatCards slots={data.slots} devices={data.devices} bookings={data.bookings} user={{ role: 'admin' }} />

      {/* แบนเนอร์เปิดดูกราฟสถิติการใช้งาน */}
      <div className="panel" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, rgba(20,35,48,0.92), rgba(16,24,34,0.95))',
        border: '1px solid #284459',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        borderRadius: 14,
        flexWrap: 'wrap',
        gap: 14,
        marginBottom: 22
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(54,220,201,0.2), rgba(32,135,255,0.2))',
            border: '1px solid rgba(54,220,201,0.4)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 24,
            flexShrink: 0
          }}>
            ▤
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>สถิติและการวิเคราะห์การใช้ช่องจอด</h3>
            <p style={{ margin: '4px 0 0', color: '#93a6ba', fontSize: 13 }}>
              ดูกราฟแนวโน้มการใช้งานรายวัน รายสัปดาห์ รายเดือน และสัดส่วนแยกตามชนิดช่องจอด
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}
          onClick={() => setView?.('analytics')}
        >
          <span>เปิดดูกราฟสถิติ</span>
          <span style={{ fontSize: 16 }}>→</span>
        </button>
      </div>

      <section className="panel"><div className="panel-title"><h2>รายได้วันนี้</h2><strong className="highlight">฿{formatMoney(revenue)}</strong></div><p className="muted">รวมจากรายการจองประจำวันที่ {today}</p></section>
      <section className="panel"><div className="panel-title"><h2>ประวัติการจองทั้งหมด</h2><span className="muted">{bookings.length} รายการ</span></div><div className="table-wrap"><table><thead><tr><th>ช่องจอด</th><th>ผู้จอง</th><th>ยานพาหนะ</th><th>วันที่</th><th>เวลา</th><th>ระยะเวลา</th><th>จำนวนเงิน</th><th>สถานะ</th><th>ทำรายการเมื่อ</th></tr></thead><tbody>{bookings.length ? bookings.map((booking) => <tr key={booking.id}><td>{booking.slot_id}</td><td>{userName(booking.user_id)}</td><td>{booking.license_plate ? <div><strong style={{ color: '#fff', font: '600 13px "JetBrains Mono"' }}>{booking.license_plate}</strong><div style={{ fontSize: 11, color: 'var(--cyan)' }}>{booking.vehicle_type || '-'}</div></div> : '-'}</td><td>{booking.date}</td><td>{formatThaiTime(booking.time)} น.</td><td>{booking.duration} ชั่วโมง</td><td>฿{formatMoney(booking.amount)}</td><td><span className={`badge ${booking.status}`}>{booking.status}</span></td><td>{new Date(booking.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td></tr>) : <tr><td colSpan="9">ยังไม่มีรายการจอง</td></tr>}</tbody></table></div></section>
    </>
  );
}

function AdminAnalytics({ data }) {
  const [period, setPeriod] = useState('day'); // 'day' | 'week' | 'month'
  const [dayRange, setDayRange] = useState(14); // 7 | 14 | 30
  const [slotTypeFilter, setSlotTypeFilter] = useState('all');
  const [metricType, setMetricType] = useState('count'); // 'count' | 'revenue' | 'hours'
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Map slots for quick lookup
  const slotMap = useMemo(() => new Map((data.slots || []).map((s) => [s.id, s])), [data.slots]);

  const getBookingType = useCallback((b) => {
    const s = slotMap.get(b.slot_id);
    const raw = s?.type || 'ลูกค้าทั่วไป';
    return raw === 'ปกติ' ? 'ลูกค้าทั่วไป' : raw;
  }, [slotMap]);

  // Unique slot types in system
  const allSlotTypes = useMemo(() => {
    const types = new Set(['ลูกค้าทั่วไป', 'สมาชิก', 'ผู้พิการ', 'ชาร์จ EV']);
    (data.slots || []).forEach((s) => {
      const t = s.type === 'ปกติ' ? 'ลูกค้าทั่วไป' : (s.type || 'ลูกค้าทั่วไป');
      types.add(t);
    });
    return Array.from(types);
  }, [data.slots]);

  // Valid non-cancelled bookings
  const validBookings = useMemo(() => {
    return (data.bookings || []).filter((b) => b.status !== 'cancelled');
  }, [data.bookings]);

  // Color mapper for slot types
  const getTypeColor = (type) => {
    if (type === 'สมาชิก') return '#fbbf24';
    if (type === 'ผู้พิการ') return '#a78bfa';
    if (type === 'ชาร์จ EV') return '#34d399';
    if (type === 'ลูกค้าทั่วไป' || type === 'ปกติ') return '#38bdf8';
    return '#f472b6';
  };

  const getTypeIcon = () => '';

  // Helper date formatter
  const toIso = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Generate trend points based on period
  const trendData = useMemo(() => {
    const now = new Date();

    if (period === 'day') {
      const points = [];
      const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const dayShorts = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

      for (let i = dayRange - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const iso = toIso(d);
        const dayBookings = validBookings.filter((b) => {
          if (b.date !== iso) return false;
          if (slotTypeFilter !== 'all' && getBookingType(b) !== slotTypeFilter) return false;
          return true;
        });

        const count = dayBookings.length;
        const revenue = dayBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);
        const hours = dayBookings.reduce((sum, b) => sum + Number(b.duration || 0), 0);

        const typeCounts = {};
        dayBookings.forEach((b) => {
          const t = getBookingType(b);
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        });

        points.push({
          key: iso,
          label: `${d.getDate()} ${thMonths[d.getMonth()]}`,
          subLabel: dayShorts[d.getDay()],
          fullDate: `${d.getDate()} ${thMonths[d.getMonth()]} (${dayShorts[d.getDay()]})`,
          count,
          revenue,
          hours,
          typeCounts
        });
      }
      return points;
    }

    if (period === 'week') {
      const points = [];
      const numWeeks = 8;
      const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      for (let i = numWeeks - 1; i >= 0; i--) {
        const targetDate = new Date(now.getTime() - i * 7 * 86400000);
        const dayOfWeek = targetDate.getDay();
        const diffToMonday = (dayOfWeek + 6) % 7;
        const monday = new Date(targetDate.getTime() - diffToMonday * 86400000);
        const sunday = new Date(monday.getTime() + 6 * 86400000);

        const startIso = toIso(monday);
        const endIso = toIso(sunday);

        const weekBookings = validBookings.filter((b) => {
          if (b.date < startIso || b.date > endIso) return false;
          if (slotTypeFilter !== 'all' && getBookingType(b) !== slotTypeFilter) return false;
          return true;
        });

        const count = weekBookings.length;
        const revenue = weekBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);
        const hours = weekBookings.reduce((sum, b) => sum + Number(b.duration || 0), 0);

        const typeCounts = {};
        weekBookings.forEach((b) => {
          const t = getBookingType(b);
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        });

        const weekNum = numWeeks - i;
        points.push({
          key: `week-${i}`,
          label: `สัปดาห์ ${weekNum}`,
          subLabel: `${monday.getDate()}/${monday.getMonth() + 1}`,
          fullDate: `${monday.getDate()} ${thMonths[monday.getMonth()]} - ${sunday.getDate()} ${thMonths[sunday.getMonth()]}`,
          count,
          revenue,
          hours,
          typeCounts
        });
      }
      return points;
    }

    if (period === 'month') {
      const points = [];
      const numMonths = 6;
      const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      for (let i = numMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const monthBookings = validBookings.filter((b) => {
          if (!String(b.date).startsWith(ym)) return false;
          if (slotTypeFilter !== 'all' && getBookingType(b) !== slotTypeFilter) return false;
          return true;
        });

        const count = monthBookings.length;
        const revenue = monthBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);
        const hours = monthBookings.reduce((sum, b) => sum + Number(b.duration || 0), 0);

        const typeCounts = {};
        monthBookings.forEach((b) => {
          const t = getBookingType(b);
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        });

        const thYear = (d.getFullYear() + 543).toString().slice(-2);
        points.push({
          key: ym,
          label: thMonths[d.getMonth()],
          subLabel: `'${thYear}`,
          fullDate: `${thMonths[d.getMonth()]} 25${thYear}`,
          count,
          revenue,
          hours,
          typeCounts
        });
      }
      return points;
    }

    return [];
  }, [period, dayRange, slotTypeFilter, validBookings, getBookingType]);

  // Totals for current scope
  const totals = useMemo(() => {
    const totalBookings = trendData.reduce((sum, p) => sum + p.count, 0);
    const totalRevenue = trendData.reduce((sum, p) => sum + p.revenue, 0);
    const totalHours = trendData.reduce((sum, p) => sum + p.hours, 0);
    const avgDuration = totalBookings > 0 ? (totalHours / totalBookings).toFixed(1) : 0;
    const avgPrice = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;
    const daysCount = period === 'day' ? dayRange : period === 'week' ? 56 : 180;
    const totalSlots = (data.slots || []).length || 12;
    const occupancyRate = ((totalHours / (daysCount * 24 * totalSlots)) * 100).toFixed(1);
    return { totalBookings, totalRevenue, totalHours, avgDuration, avgPrice, occupancyRate };
  }, [trendData, period, dayRange, data.slots]);

  // Breakdown by slot type
  const typeBreakdown = useMemo(() => {
    const relevantKeys = new Set(trendData.map((p) => p.key));
    const scopedBookings = validBookings.filter((b) => {
      if (period === 'day') return relevantKeys.has(b.date);
      if (period === 'month') return relevantKeys.has(String(b.date).slice(0, 7));
      return true;
    });

    const groups = {};
    allSlotTypes.forEach((t) => {
      groups[t] = { type: t, count: 0, revenue: 0, hours: 0 };
    });

    scopedBookings.forEach((b) => {
      const t = getBookingType(b);
      if (!groups[t]) groups[t] = { type: t, count: 0, revenue: 0, hours: 0 };
      groups[t].count += 1;
      groups[t].revenue += Number(b.amount || 0);
      groups[t].hours += Number(b.duration || 0);
    });

    const sumCount = Math.max(1, Object.values(groups).reduce((sum, g) => sum + g.count, 0));
    const list = Object.values(groups).map((g) => {
      const percentage = Number(((g.count / sumCount) * 100).toFixed(1));
      const slotsCount = (data.slots || []).filter((s) => (s.type === 'ปกติ' ? 'ลูกค้าทั่วไป' : (s.type || 'ลูกค้าทั่วไป')) === g.type).length;
      return {
        ...g,
        percentage,
        slotsCount,
        color: getTypeColor(g.type),
        icon: getTypeIcon(g.type)
      };
    }).sort((a, b) => b.count - a.count);

    return { list, totalBookings: scopedBookings.length };
  }, [trendData, validBookings, period, allSlotTypes, getBookingType, data.slots]);

  // Day of week traffic distribution
  const dayOfWeekDistribution = useMemo(() => {
    const days = [
      { name: 'จันทร์', short: 'จ.', count: 0, revenue: 0 },
      { name: 'อังคาร', short: 'อ.', count: 0, revenue: 0 },
      { name: 'พุธ', short: 'พ.', count: 0, revenue: 0 },
      { name: 'พฤหัสบดี', short: 'พฤ.', count: 0, revenue: 0 },
      { name: 'ศุกร์', short: 'ศ.', count: 0, revenue: 0 },
      { name: 'เสาร์', short: 'ส.', count: 0, revenue: 0 },
      { name: 'อาทิตย์', short: 'อา.', count: 0, revenue: 0 }
    ];

    validBookings.forEach((b) => {
      if (slotTypeFilter !== 'all' && getBookingType(b) !== slotTypeFilter) return;
      if (!b.date) return;
      const d = new Date(`${b.date}T12:00:00Z`);
      const jsDay = d.getDay();
      const idx = (jsDay + 6) % 7;
      if (days[idx]) {
        days[idx].count += 1;
        days[idx].revenue += Number(b.amount || 0);
      }
    });

    const maxCount = Math.max(1, ...days.map((d) => d.count));
    const peakDay = days.reduce((best, cur) => cur.count > best.count ? cur : best, days[0]);
    return { days, maxCount, peakDay: peakDay.count > 0 ? peakDay : null };
  }, [validBookings, slotTypeFilter, getBookingType]);

  // Slot leaderboard
  const slotLeaderboard = useMemo(() => {
    const counts = {};
    validBookings.forEach((b) => {
      if (slotTypeFilter !== 'all' && getBookingType(b) !== slotTypeFilter) return;
      counts[b.slot_id] = (counts[b.slot_id] || 0) + 1;
    });

    const list = Object.entries(counts).map(([slotId, count]) => {
      const s = slotMap.get(slotId);
      return {
        slotId,
        count,
        type: s?.type || 'ลูกค้าทั่วไป',
        floor: s?.floor || 1
      };
    }).sort((a, b) => b.count - a.count).slice(0, 6);

    const maxCount = Math.max(1, ...(list.map((x) => x.count)));
    return { list, maxCount };
  }, [validBookings, slotTypeFilter, getBookingType, slotMap]);

  // Chart layout metrics
  const maxMetricVal = useMemo(() => {
    const vals = trendData.map((p) => p[metricType]);
    return Math.max(1, ...vals);
  }, [trendData, metricType]);

  // Donut chart arc calculations
  const donutArcs = useMemo(() => {
    const activeSlices = typeBreakdown.list.filter((t) => t.count > 0);
    const C = 2 * Math.PI * 62; // Circumference ≈ 389.55
    let accum = 0;
    return activeSlices.map((slice) => {
      const strokeDasharray = `${(slice.percentage / 100) * C} ${C}`;
      const strokeDashoffset = -accum;
      accum += (slice.percentage / 100) * C;
      return { ...slice, strokeDasharray, strokeDashoffset };
    });
  }, [typeBreakdown]);

  return (
    <>
      <PageHead
        title="สถิติและการวิเคราะห์การใช้ช่องจอด"
        description="ติดตามความถี่การใช้งาน รายได้ และพฤติกรรมการจอดตามวัน สัปดาห์ เดือน และชนิดช่องจอด"
      />

      {/* ─── แถบควบคุมช่วงเวลาและตัวกรอง ─── */}
      <div className="analytics-header-row">
        <div className="analytics-filter-group">
          {/* เลือกช่วงเวลาหลัก */}
          <div className="analytics-period-tabs">
            <button
              type="button"
              className={`analytics-period-btn ${period === 'day' ? 'active' : ''}`}
              onClick={() => setPeriod('day')}
            >
              รายวัน (Daily)
            </button>
            <button
              type="button"
              className={`analytics-period-btn ${period === 'week' ? 'active' : ''}`}
              onClick={() => setPeriod('week')}
            >
              รายสัปดาห์ (Weekly)
            </button>
            <button
              type="button"
              className={`analytics-period-btn ${period === 'month' ? 'active' : ''}`}
              onClick={() => setPeriod('month')}
            >
              รายเดือน (Monthly)
            </button>
          </div>

          {/* ช่วงย่อยสำหรับรายวัน */}
          {period === 'day' && (
            <div style={{ display: 'inline-flex', gap: 4, background: '#111722', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`chart-metric-btn ${dayRange === days ? 'active' : ''}`}
                  onClick={() => setDayRange(days)}
                >
                  {days} วัน
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ป้ายแสดงจำนวนข้อมูล */}
        <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" style={{ width: 7, height: 7 }} />
          <span>ข้อมูลจากระบบ: <strong>{validBookings.length}</strong> รายการจอง</span>
        </div>
      </div>

      {/* ─── ตัวกรองตามชนิดช่องจอด (Type Filter Chips) ─── */}
      <div className="analytics-type-chips">
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginRight: 4 }}>
          กรองชนิดช่องจอด:
        </span>
        <button
          type="button"
          className={`analytics-chip ${slotTypeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setSlotTypeFilter('all')}
        >
          ทุกประเภท ({validBookings.length})
        </button>
        {allSlotTypes.map((t) => {
          const count = validBookings.filter((b) => getBookingType(b) === t).length;
          return (
            <button
              key={t}
              type="button"
              className={`analytics-chip ${slotTypeFilter === t ? 'active' : ''}`}
              style={{
                borderColor: slotTypeFilter === t ? getTypeColor(t) : undefined,
                color: slotTypeFilter === t ? getTypeColor(t) : undefined
              }}
              onClick={() => setSlotTypeFilter(t)}
            >
              <span>{t}</span>
              <span style={{ opacity: 0.75, fontSize: 11 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ─── การ์ดสรุป KPI ด้านบน ─── */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card" style={{ '--kpi-color': '#36dcc9' }}>
          <div className="analytics-kpi-label">
            <span>การใช้งานทั้งหมด</span>
          </div>
          <div className="analytics-kpi-val">{totals.totalBookings.toLocaleString('th-TH')} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>ครั้ง</span></div>
          <div className="analytics-kpi-sub">
            {period === 'day' ? `ในรอบ ${dayRange} วันล่าสุด` : period === 'week' ? 'ในรอบ 8 สัปดาห์' : 'ในรอบ 6 เดือน'}
          </div>
        </div>

        <div className="analytics-kpi-card" style={{ '--kpi-color': '#fbbf24' }}>
          <div className="analytics-kpi-label">
            <span>รายได้ค่าจอดรวม</span>
          </div>
          <div className="analytics-kpi-val" style={{ color: '#fbbf24' }}>฿{totals.totalRevenue.toLocaleString('th-TH')}</div>
          <div className="analytics-kpi-sub">
            เฉลี่ย ฿{totals.avgPrice.toLocaleString('th-TH')} / การจอง
          </div>
        </div>

        <div className="analytics-kpi-card" style={{ '--kpi-color': '#38bdf8' }}>
          <div className="analytics-kpi-label">
            <span>ชั่วโมงการจอดรวม</span>
          </div>
          <div className="analytics-kpi-val">{totals.totalHours.toLocaleString('th-TH')} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>ชม.</span></div>
          <div className="analytics-kpi-sub">
            เฉลี่ย {totals.avgDuration} ชม. / ครั้ง
          </div>
        </div>

        <div className="analytics-kpi-card" style={{ '--kpi-color': '#a78bfa' }}>
          <div className="analytics-kpi-label">
            <span>วันที่มีการใช้สูงสุด</span>
          </div>
          <div className="analytics-kpi-val" style={{ color: '#a78bfa', fontSize: 24 }}>
            {dayOfWeekDistribution.peakDay ? `วัน${dayOfWeekDistribution.peakDay.name}` : '-'}
          </div>
          <div className="analytics-kpi-sub">
            {dayOfWeekDistribution.peakDay ? `${dayOfWeekDistribution.peakDay.count} ครั้ง (${dayOfWeekDistribution.peakDay.revenue.toLocaleString('th-TH')} บาท)` : 'ยังไม่มีข้อมูล'}
          </div>
        </div>
      </div>

      {/* ─── กราฟหลัก (แนวโน้ม + สัดส่วนชนิดช่องจอด) ─── */}
      <div className="analytics-main-grid">
        {/* กราฟแท่งแนวโน้มตามช่วงเวลา */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <span>แนวโน้มการใช้ช่องจอด</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                ({period === 'day' ? `รายวัน ${dayRange} วัน` : period === 'week' ? 'รายสัปดาห์ (8 สัปดาห์)' : 'รายเดือน (6 เดือน)'})
              </span>
            </h3>

            {/* สลับการแสดงผลกราฟ: จำนวนครั้ง | รายได้ | ชั่วโมง */}
            <div className="chart-metric-toggle">
              <button
                type="button"
                className={`chart-metric-btn ${metricType === 'count' ? 'active' : ''}`}
                onClick={() => setMetricType('count')}
              >
                ครั้ง
              </button>
              <button
                type="button"
                className={`chart-metric-btn ${metricType === 'revenue' ? 'active' : ''}`}
                onClick={() => setMetricType('revenue')}
              >
                รายได้ (฿)
              </button>
              <button
                type="button"
                className={`chart-metric-btn ${metricType === 'hours' ? 'active' : ''}`}
                onClick={() => setMetricType('hours')}
              >
                ชั่วโมง
              </button>
            </div>
          </div>

          {/* SVG Bar Chart */}
          <div className="chart-svg-wrap" onMouseLeave={() => setHoveredIndex(null)}>
            <svg viewBox="0 0 680 230" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <defs>
                <linearGradient id="barGradientCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#36dcc9" stopOpacity="1" />
                  <stop offset="100%" stopColor="#2087ff" stopOpacity="0.4" />
                </linearGradient>
                <linearGradient id="barGradientRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15" stopOpacity="1" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
                </linearGradient>
                <linearGradient id="barGradientHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8e82ff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.4" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="50" y1="35" x2="665" y2="35" stroke="#253243" strokeDasharray="3 3" />
              <line x1="50" y1="110" x2="665" y2="110" stroke="#253243" strokeDasharray="3 3" />
              <line x1="50" y1="185" x2="665" y2="185" stroke="#334458" strokeWidth="1.2" />

              {/* Y Axis Labels */}
              <text x="42" y="38" textAnchor="end" fill="#64748b" fontSize="10.5" fontFamily="JetBrains Mono">
                {metricType === 'revenue' ? `฿${maxMetricVal}` : maxMetricVal}
              </text>
              <text x="42" y="113" textAnchor="end" fill="#64748b" fontSize="10.5" fontFamily="JetBrains Mono">
                {metricType === 'revenue' ? `฿${Math.round(maxMetricVal / 2)}` : Math.round(maxMetricVal / 2)}
              </text>
              <text x="42" y="188" textAnchor="end" fill="#64748b" fontSize="10.5" fontFamily="JetBrains Mono">
                0
              </text>

              {/* Bars */}
              {trendData.map((point, index) => {
                const N = trendData.length;
                const chartWidth = 610;
                const step = chartWidth / N;
                const barWidth = Math.max(8, Math.min(32, step * 0.65));
                const x = 55 + index * step + (step - barWidth) / 2;
                const val = point[metricType] || 0;
                const barHeight = maxMetricVal > 0 ? (val / maxMetricVal) * 145 : 0;
                const y = 185 - barHeight;
                const isHovered = hoveredIndex === index;

                const gradId = metricType === 'count' ? 'url(#barGradientCount)' : metricType === 'revenue' ? 'url(#barGradientRevenue)' : 'url(#barGradientHours)';

                return (
                  <g
                    key={point.key}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onClick={() => setHoveredIndex(index)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Invisible full-height hit area for comfortable hover */}
                    <rect x={55 + index * step} y="20" width={step} height="175" fill="transparent" />

                    {/* Bar Background Slot */}
                    <rect
                      x={x}
                      y="35"
                      width={barWidth}
                      height="150"
                      rx="4"
                      fill="rgba(255,255,255,0.02)"
                    />

                    {/* Active Bar */}
                    {barHeight > 0 && (
                      <rect
                        className="chart-bar-rect"
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="4"
                        fill={gradId}
                        style={{
                          opacity: isHovered ? 1 : 0.88,
                          stroke: isHovered ? '#ffffff' : 'none',
                          strokeWidth: 1.5
                        }}
                      />
                    )}

                    {/* Value on top of bar if active or large */}
                    {barHeight > 25 && (
                      <text
                        x={x + barWidth / 2}
                        y={y - 5}
                        textAnchor="middle"
                        fill={isHovered ? '#ffffff' : '#cbd5e1'}
                        fontSize="9.5"
                        fontWeight="700"
                        fontFamily="JetBrains Mono"
                      >
                        {metricType === 'revenue' ? `฿${val}` : val}
                      </text>
                    )}

                    {/* X Axis Label */}
                    <text
                      x={x + barWidth / 2}
                      y="204"
                      textAnchor="middle"
                      fill={isHovered ? 'var(--cyan)' : '#8091a5'}
                      fontSize={N > 14 ? '8.5' : '10'}
                      fontWeight={isHovered ? '700' : '500'}
                    >
                      {point.label}
                    </text>
                    {point.subLabel && N <= 14 && (
                      <text
                        x={x + barWidth / 2}
                        y="218"
                        textAnchor="middle"
                        fill="#506175"
                        fontSize="8.5"
                      >
                        {point.subLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredIndex !== null && trendData[hoveredIndex] && (
              <div style={{
                position: 'absolute',
                top: 8,
                right: 12,
                background: 'rgba(12, 18, 26, 0.96)',
                border: '1px solid rgba(54, 220, 201, 0.4)',
                borderRadius: 9,
                padding: '8px 12px',
                fontSize: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <div>
                  <strong style={{ color: '#fff' }}>{trendData[hoveredIndex].fullDate}</strong>
                </div>
                <div style={{ display: 'flex', gap: 10, fontFamily: 'JetBrains Mono' }}>
                  <span style={{ color: 'var(--cyan)' }}>{trendData[hoveredIndex].count} ครั้ง</span>
                  <span style={{ color: '#fbbf24' }}>฿{trendData[hoveredIndex].revenue.toLocaleString('th-TH')}</span>
                  <span style={{ color: '#a78bfa' }}>{trendData[hoveredIndex].hours} ชม.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* กราฟสัดส่วนชนิดช่องจอด (Donut Chart & Progress Bars) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <span>สัดส่วนตามชนิดช่องจอด</span>
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              รวม {typeBreakdown.totalBookings} รายการ
            </span>
          </div>

          <div className="donut-wrap">
            {/* SVG Donut */}
            <div style={{ width: 170, height: 170, position: 'relative', flexShrink: 0 }}>
              <svg viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                {/* Background Ring */}
                <circle cx="90" cy="90" r="62" fill="none" stroke="#182330" strokeWidth="20" />
                {donutArcs.length > 0 ? donutArcs.map((slice) => (
                  <circle
                    key={slice.type}
                    cx="90"
                    cy="90"
                    r="62"
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="20"
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    strokeLinecap="butt"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                )) : (
                  <circle cx="90" cy="90" r="62" fill="none" stroke="#2a384a" strokeWidth="20" strokeDasharray="10 6" />
                )}
              </svg>
              {/* Donut Center Display */}
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}>
                <strong style={{ fontSize: 24, color: '#fff', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
                  {typeBreakdown.totalBookings}
                </strong>
                <small style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  การใช้งาน
                </small>
              </div>
            </div>

            {/* Breakdown List with Bars */}
            <div className="donut-legend-list">
              {typeBreakdown.list.map((item) => (
                <div key={item.type} className="donut-legend-item">
                  <div className="donut-legend-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="donut-color-dot" style={{ background: item.color }} />
                      <strong style={{ color: '#fff' }}>{item.type}</strong>
                    </div>
                    <div>
                      <strong style={{ color: item.color, fontFamily: 'JetBrains Mono' }}>
                        {item.percentage}%
                      </strong>
                      <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 4 }}>
                        ({item.count} ครั้ง)
                      </span>
                    </div>
                  </div>
                  <div className="type-progress-track">
                    <div
                      className="type-progress-bar"
                      style={{ width: `${item.percentage}%`, background: item.color }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7e8fa3', marginTop: 1 }}>
                    <span>มีในระบบ {item.slotsCount} ช่อง</span>
                    <span style={{ color: '#facc15' }}>฿{item.revenue.toLocaleString('th-TH')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── แถวที่ 2: ความหนาแน่นรายวันในสัปดาห์ + อันดับช่องจอด ─── */}
      <div className="analytics-main-grid">
        {/* กราฟความหนาแน่นตามวันในสัปดาห์ (Day-of-Week Distribution) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3 className="chart-card-title">
                <span>ความหนาแน่นตามวันในสัปดาห์</span>
              </h3>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                สถิติการใช้งานแยกตามวันจันทร์ - อาทิตย์ เพื่อดูพฤติกรรมช่วงเวลาหนาแน่น
              </p>
            </div>
            {dayOfWeekDistribution.peakDay && (
              <span className="badge pending" style={{ fontSize: 11.5, padding: '4px 9px' }}>
                วัน{dayOfWeekDistribution.peakDay.name} แน่นสุด ({dayOfWeekDistribution.peakDay.count} คัน)
              </span>
            )}
          </div>

          <div className="day-bar-grid">
            {dayOfWeekDistribution.days.map((day) => {
              const isPeak = dayOfWeekDistribution.peakDay && day.name === dayOfWeekDistribution.peakDay.name && day.count > 0;
              const heightPct = dayOfWeekDistribution.maxCount > 0 ? (day.count / dayOfWeekDistribution.maxCount) * 100 : 0;
              return (
                <div key={day.name} className="day-bar-col">
                  {day.count > 0 && (
                    <span style={{
                      fontSize: 11,
                      color: isPeak ? '#fbbf24' : 'var(--cyan)',
                      fontFamily: 'JetBrains Mono',
                      fontWeight: 700,
                      marginBottom: 4
                    }}>
                      {day.count}
                    </span>
                  )}
                  <div
                    className={`day-bar-fill ${isPeak ? 'peak' : ''}`}
                    style={{ height: `${Math.max(6, heightPct)}%` }}
                    title={`${day.name}: ${day.count} ครั้ง (฿${day.revenue.toLocaleString('th-TH')})`}
                  />
                  <span className="day-bar-label">{day.short}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* อันดับช่องจอดยอดนิยม (Slot Utilization Leaderboard) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <span>ช่องจอดที่ถูกใช้งานสูงสุด</span>
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Top 6 ช่องจอด
            </span>
          </div>

          <div>
            {slotLeaderboard.list.length > 0 ? slotLeaderboard.list.map((item, idx) => {
              const pct = Number(((item.count / slotLeaderboard.maxCount) * 100).toFixed(0));
              const tColor = getTypeColor(item.type);
              return (
                <div key={item.slotId} className="slot-leader-item">
                  <div className="slot-leader-badge" style={{ borderColor: idx === 0 ? '#fbbf24' : '#36485e' }}>
                    #{idx + 1}
                  </div>
                  <div className="slot-leader-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 15, color: '#fff', fontFamily: 'JetBrains Mono' }}>
                          ช่อง {item.slotId}
                        </strong>
                        <span style={{ fontSize: 11, color: tColor, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
                          {item.type}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          ชั้น {item.floor}
                        </span>
                      </div>
                      <strong style={{ color: 'var(--cyan)', fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                        {item.count} ครั้ง
                      </strong>
                    </div>
                    <div className="type-progress-track">
                      <div className="type-progress-bar" style={{ width: `${pct}%`, background: idx === 0 ? '#fbbf24' : 'var(--cyan)' }} />
                    </div>
                  </div>
                </div>
              );
            }) : (
              <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                ยังไม่มีข้อมูลการใช้งานช่องจอด
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── ตารางสรุปเชิงลึกแยกตามชนิดช่องจอด ─── */}
      <section className="panel" style={{ marginTop: 8 }}>
        <div className="panel-title">
          <h2>ตารางสรุปสถิติแยกตามชนิดช่องจอด</h2>
          <span className="muted">{typeBreakdown.list.length} ประเภทช่องจอด</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชนิดช่องจอด</th>
                <th>จำนวนช่องในระบบ</th>
                <th>จำนวนครั้งที่จอง</th>
                <th>ชั่วโมงจอดรวม</th>
                <th>รายได้รวม</th>
                <th>เฉลี่ยเวลาต่อครั้ง</th>
                <th>ส่วนแบ่งการจอง (%)</th>
              </tr>
            </thead>
            <tbody>
              {typeBreakdown.list.map((row) => {
                const avgHrs = row.count > 0 ? (row.hours / row.count).toFixed(1) : '0';
                return (
                  <tr key={row.type}>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="donut-color-dot" style={{ background: row.color }} />
                        <strong>{row.type}</strong>
                      </div>
                    </td>
                    <td>{row.slotsCount} ช่อง</td>
                    <td><strong style={{ color: '#fff', fontFamily: 'JetBrains Mono' }}>{row.count}</strong> ครั้ง</td>
                    <td>{row.hours} ชม.</td>
                    <td><strong style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono' }}>฿{row.revenue.toLocaleString('th-TH')}</strong></td>
                    <td>{avgHrs} ชั่วโมง</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                        <div className="type-progress-track" style={{ flex: 1, margin: 0 }}>
                          <div className="type-progress-bar" style={{ width: `${row.percentage}%`, background: row.color }} />
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: row.color, fontWeight: 700 }}>
                          {row.percentage}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AdminUsers({ data, notify }) {
  const [activeTab, setActiveTab] = useState('pending');
  const pending = (data.credit_requests || []).filter((item) => item.status === 'pending');
  const allRequests = [...(data.credit_requests || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const userName = (id) => data.users.find((item) => item.id === id)?.name || id;
  const userUsername = (id) => data.users.find((item) => item.id === id)?.username || id;
  const creditHistory = [...(data.credit_history || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  async function adjust(item, type) {
    const amount = Number(window.prompt(`${type === 'add' ? 'เพิ่ม' : 'หัก'}เครดิตของ ${item.name} จำนวนเท่าไร?`, '100'));
    if (!amount) return;
    const reason = window.prompt('เหตุผล', type === 'add' ? 'เติมเครดิตโดยผู้ดูแล' : 'หักเครดิตโดยผู้ดูแล');
    if (!reason) return;
    try {
      await api(`/admin/users/${item.id}/credit`, { method: 'POST', body: JSON.stringify({ type, amount, reason }) });
      notify('ปรับเครดิตเรียบร้อย');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function updateUser(item, patch) {
    try {
      await api(`/admin/users/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      notify('อัปเดตผู้ใช้แล้ว กรุณาให้ผู้ใช้ออกจากระบบและเข้าใหม่หากเปลี่ยนบทบาท');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function review(id, action) {
    try {
      await api(`/admin/credit-requests/${id}/${action}`, { method: 'POST' });
      notify(action === 'approve' ? 'อนุมัติคำขอเติมเครดิตแล้ว' : 'ปฏิเสธคำขอแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }

  return (
    <>
      <PageHead title="จัดการผู้ใช้ & คำขอเครดิต" description="ตรวจสอบคำขอเติมเครดิต อนุมัติ/ปฏิเสธ เปลี่ยนบทบาท และจัดการผู้ใช้งาน" />

      {/* Credit Requests Section */}
      <section className="panel">
        <div className="panel-title">
          <h2>คำขอเติมเครดิต</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`button compact ${activeTab === 'pending' ? 'primary' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              รอดำเนินการ ({pending.length})
            </button>
            <button
              type="button"
              className={`button compact ${activeTab === 'all' ? 'primary' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              ประวัติคำขอทั้งหมด ({allRequests.length})
            </button>
          </div>
        </div>

        {activeTab === 'pending' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ผู้ใช้</th><th>ชื่อบัญชี</th><th>จำนวน</th><th>เหตุผล / หลักฐาน</th><th>วันที่ขอ</th><th /></tr>
              </thead>
              <tbody>
                {pending.length ? pending.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{userName(item.user_id)}</strong></td>
                    <td><span className="muted">{userUsername(item.user_id)}</span></td>
                    <td><strong style={{ color: 'var(--cyan)' }}>฿{formatMoney(item.amount)}</strong></td>
                    <td>{item.reason}</td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="button primary compact" onClick={() => review(item.id, 'approve')}>✓ อนุมัติ</button>
                        <button className="button danger compact" onClick={() => review(item.id, 'reject')}>✕ ปฏิเสธ</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>ไม่มีคำขอที่รอดำเนินการ</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ผู้ใช้</th><th>ชื่อบัญชี</th><th>จำนวน</th><th>เหตุผล / หลักฐาน</th><th>สถานะ</th><th>วันที่ขอ</th><th>วันที่อนุมัติ</th></tr>
              </thead>
              <tbody>
                {allRequests.length ? allRequests.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{userName(item.user_id)}</strong></td>
                    <td><span className="muted">{userUsername(item.user_id)}</span></td>
                    <td><strong style={{ color: item.status === 'approved' ? 'var(--cyan)' : 'inherit' }}>฿{formatMoney(item.amount)}</strong></td>
                    <td>{item.reason}</td>
                    <td>
                      <span className={`badge ${item.status === 'approved' ? 'available' : item.status === 'rejected' ? 'unavailable' : 'pending'}`}>
                        {item.status === 'approved' ? '🟢 อนุมัติแล้ว' : item.status === 'rejected' ? '🔴 ปฏิเสธ' : '🟡 รออนุมัติ'}
                      </span>
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>{item.reviewed_at ? new Date(item.reviewed_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-'}</td>
                  </tr>
                )) : <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>ยังไม่มีประวัติคำขอเติมเครดิต</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Users Management Section */}
      <section className="panel">
        <div className="panel-title">
          <h2>รายชื่อผู้ใช้ทั้งหมด</h2>
          <span className="muted">{data.users.length} คน</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>LINE</th><th>บทบาท</th><th>เครดิต</th><th>สถานะ</th><th /></tr>
            </thead>
            <tbody>
              {data.users.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td><span className="muted">{item.username}</span></td>
                  <td>
                    <span className={`badge ${item.line_user_id ? 'available' : 'unavailable'}`}>
                      {item.line_user_id ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
                    </span>
                  </td>
                  <td>
                    <select
                      value={item.role}
                      disabled={item.id === JSON.parse(localStorage.user || '{}').id}
                      onChange={(e) => updateUser(item, { role: e.target.value })}
                    >
                      <option value="user">ผู้ใช้</option>
                      <option value="admin">ผู้ดูแลระบบ</option>
                    </select>
                  </td>
                  <td>
                    <strong style={{ color: Number(item.credit || 0) > 0 ? '#34d399' : '#f87171' }}>
                      ฿{formatMoney(item.credit)}
                    </strong>
                  </td>
                  <td>
                    <button className="button compact" onClick={() => updateUser(item, { status: item.status === 'active' ? 'inactive' : 'active' })}>
                      {item.status}
                    </button>
                  </td>
                  <td>
                    {item.role !== 'admin' && (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="button primary compact" onClick={() => adjust(item, 'add')}>+ เพิ่มเครดิต</button>
                        <button className="button danger compact" onClick={() => adjust(item, 'reduce')}>- หักเครดิต</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Credit History Section */}
      <section className="panel">
        <div className="panel-title">
          <h2>ประวัติการทำรายการเครดิตทั้งหมด</h2>
          <span className="muted">{creditHistory.length} รายการ</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>วันที่-เวลา</th><th>ผู้ใช้</th><th>ประเภท</th><th>จำนวน</th><th>รายละเอียด</th><th>ที่มา</th></tr>
            </thead>
            <tbody>
              {creditHistory.length ? creditHistory.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                  <td><strong>{userName(item.user_id)}</strong></td>
                  <td>
                    <span className={`badge ${item.type === 'add' ? 'available' : 'unavailable'}`}>
                      {item.type === 'add' ? '+ เพิ่มเครดิต' : '- หักเครดิต'}
                    </span>
                  </td>
                  <td className={item.type === 'add' ? 'highlight' : ''} style={item.type === 'add' ? { fontSize: 'inherit', fontWeight: 600 } : {}}>
                    {item.type === 'add' ? '+' : '-'}฿{formatMoney(item.amount)}
                  </td>
                  <td>{item.reason}</td>
                  <td>{item.source}</td>
                </tr>
              )) : <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>ยังไม่มีประวัติเครดิต</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AdminDevices({ data, reload, notify }) {
  const [filterType, setFilterType] = useState('all');
  async function toggle(device) { try { await api(`/devices/${device.id}/toggle`, { method: 'POST' }); await reload(); notify('อัปเดตสถานะอุปกรณ์แล้ว'); } catch (err) { notify(err.message, true); } }
  async function rename(device) { const name = window.prompt('ชื่ออุปกรณ์ใหม่', device.name); if (!name) return; try { await api(`/admin/devices/${device.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); notify('เปลี่ยนชื่ออุปกรณ์แล้ว'); } catch (err) { notify(err.message, true); } }
  async function link(device) { const linked_slot = window.prompt('รหัสช่องจอดที่ต้องการผูก เช่น A1 (เว้นว่างเพื่อล้าง)', device.linked_slot || ''); try { await api(`/admin/devices/${device.id}`, { method: 'PATCH', body: JSON.stringify({ linked_slot: linked_slot || null }) }); notify('อัปเดตช่องที่เชื่อมโยงแล้ว'); } catch (err) { notify(err.message, true); } }

  const sortedDevices = (data.devices || []).slice().sort((a, b) => {
    if (a.type !== b.type) return a.type === 'barrier' ? -1 : 1;
    if (a.floor !== b.floor) return a.floor - b.floor;
    return String(a.linked_slot || '').localeCompare(String(b.linked_slot || ''));
  });

  const filtered = sortedDevices.filter((d) => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    return true;
  });

  const barrierCount = sortedDevices.filter((d) => d.type === 'barrier').length;
  const sensorCount = sortedDevices.filter((d) => d.type === 'sensor').length;

  return <>
    <PageHead title="อุปกรณ์ / ไม้กั้นประจำช่อง" description={`ไม้กั้นประจำช่อง ${barrierCount} จุด (เท่ากับ 12 ช่องจอดพอดี ไม่มีไม้กั้นประจำชั้น) และเซ็นเซอร์ ${sensorCount} จุด`} />
    <div className="tabs" style={{ marginBottom: 16 }}>
      <button className={filterType === 'all' ? 'active' : ''} onClick={() => setFilterType('all')}>ทั้งหมด ({sortedDevices.length})</button>
      <button className={filterType === 'barrier' ? 'active' : ''} onClick={() => setFilterType('barrier')}>ไม้กั้นประจำช่อง ({barrierCount})</button>
      <button className={filterType === 'sensor' ? 'active' : ''} onClick={() => setFilterType('sensor')}>เซ็นเซอร์ ({sensorCount})</button>
    </div>
    <section className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>ชื่ออุปกรณ์</th>
            <th>ประเภท</th>
            <th>ช่องที่ผูก</th>
            <th>ชั้น</th>
            <th>สถานะ</th>
            <th>การทำงาน</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((device) => (
            <tr key={device.id}>
              <td>{device.name}</td>
              <td>{device.type === 'barrier' ? 'ไม้กั้นช่อง' : 'เซ็นเซอร์'}</td>
              <td><strong>{device.linked_slot || '-'}</strong></td>
              <td>ชั้น {device.floor}</td>
              <td><span className={`badge ${device.status}`}>{device.status}</span></td>
              <td>{device.type === 'barrier' ? (device.state === 'open' ? '🟢 เปิด' : '🔴 ปิด') : (device.presence === 'occupied' ? '🔴 มีรถ' : '🟢 ว่าง')}</td>
              <td>
                <button className="button compact" onClick={() => rename(device)}>เปลี่ยนชื่อ</button> <button className="button compact" onClick={() => link(device)}>ผูกช่อง</button> {device.type === 'barrier' && <button className="button primary compact" onClick={() => toggle(device)}>เปิด/ปิด</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}

function playAlertChime(priority) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (priority === 'CRITICAL') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) { }
}

function AdminAlerts({ data, user, reload, notify }) {
  const liveAdmin = (data?.users || []).find(u => u.id === user?.id) || user || (data?.users || []).find(u => u.id === JSON.parse(localStorage.user || '{}').id) || JSON.parse(localStorage.user || '{}');
  const adminsList = (data?.users || []).filter(u => u.role === 'admin');
  const readyAdminsCount = adminsList.filter(u => u.line_user_id).length;
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [testingMyLine, setTestingMyLine] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [testModal, setTestModal] = useState(false);
  const [testForm, setTestForm] = useState({ priority: 'HIGH', title: 'ทดสอบแจ้งเตือน Smart Parking', message: 'ทดสอบระบบแจ้งเตือนข้อผิดพลาดและการส่ง LINE เข้าผู้ดูแลระบบ' });
  const [testSubmitting, setTestSubmitting] = useState(false);

  const initialCfg = data.alert_configs || {
    offline_timeout_sec: 120,
    enable_offline_alert: true,
    offline_priority: 'CRITICAL',
    enable_barrier_fault_alert: true,
    barrier_fault_priority: 'CRITICAL',
    barrier_stuck_sec: 300,
    enable_sensor_flapping_alert: true,
    sensor_flapping_priority: 'HIGH',
    enable_noshow_alert: true,
    noshow_priority: 'HIGH',
    enable_overtime_alert: true,
    overtime_priority: 'HIGH',
    enable_line_admin_notify: true,
    line_admin_min_priority: 'HIGH',
    cooldown_minutes: 15,
    enable_sound_alert: true
  };
  const [config, setConfig] = useState(initialCfg);
  const [savingConfig, setSavingConfig] = useState(false);

  const selectStyle = {
    padding: '7px 12px',
    borderRadius: 7,
    background: '#1e293b',
    color: '#f8fafc',
    border: '1.5px solid rgba(56, 189, 248, 0.45)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)'
  };
  const optionStyle = {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 500
  };

  useEffect(() => {
    if (data.alert_configs) {
      setConfig(prev => ({ ...prev, ...data.alert_configs }));
    }
  }, [data.alert_configs]);

  const alerts = data.system_alerts || [];

  const filtered = alerts.filter(a => {
    if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (a.title || '').toLowerCase().includes(q);
      const matchMsg = (a.message || '').toLowerCase().includes(q);
      const matchSlot = (a.slot_id || '').toLowerCase().includes(q);
      const matchDev = (a.device_id || '').toLowerCase().includes(q);
      if (!matchTitle && !matchMsg && !matchSlot && !matchDev) return false;
    }
    return true;
  });

  const criticalCount = alerts.filter(a => a.status === 'active' && a.priority === 'CRITICAL').length;
  const highCount = alerts.filter(a => a.status === 'active' && a.priority === 'HIGH').length;
  const normalCount = alerts.filter(a => a.status === 'active' && ['NORMAL', 'INFO'].includes(a.priority)).length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;

  const getPriorityStyle = (p) => {
    switch (p) {
      case 'CRITICAL':
        return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', color: '#f87171', label: '🔴 CRITICAL (วิกฤต)' };
      case 'HIGH':
        return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24', label: '🟠 HIGH (สำคัญ)' };
      case 'NORMAL':
        return { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8', label: '🟡 NORMAL (ปานกลาง)' };
      default:
        return { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', color: '#c084fc', label: '🔵 INFO (ข้อมูลทั่วไป)' };
    }
  };

  async function acknowledge(alertId) {
    try {
      await api(`/admin/system-alerts/${alertId}/acknowledge`, { method: 'POST' });
      notify('รับทราบปัญหาเรียบร้อยแล้ว');
      await reload?.();
    } catch (e) {
      notify(e.message, true);
    }
  }

  async function resolve(alertId) {
    try {
      await api(`/admin/system-alerts/${alertId}/resolve`, { method: 'POST' });
      notify('ปิดงานแก้ไขปัญหาเรียบร้อยแล้ว');
      await reload?.();
    } catch (e) {
      notify(e.message, true);
    }
  }

  async function clearResolved() {
    if (!window.confirm('ยืนยันล้างประวัติการแจ้งเตือนที่ปิดงานแล้วทั้งหมดหรือไม่?')) return;
    try {
      await api('/admin/system-alerts/clear-resolved', { method: 'POST' });
      notify('ล้างประวัติที่แก้ไขแล้วเรียบร้อย');
      await reload?.();
    } catch (e) {
      notify(e.message, true);
    }
  }

  async function handleTestSubmit(e) {
    e.preventDefault();
    setTestSubmitting(true);
    try {
      await api('/admin/system-alerts/test', {
        method: 'POST',
        body: JSON.stringify(testForm)
      });
      playAlertChime(testForm.priority);
      setTestModal(false);
      notify(`ส่งการแจ้งเตือนทดสอบระดับ ${testForm.priority} สำเร็จ (ส่งเข้า LINE แอดมินตามเงื่อนไขเรียบร้อย)`);
      await reload?.();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setTestSubmitting(false);
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api('/admin/alert-configs', {
        method: 'PATCH',
        body: JSON.stringify(config)
      });
      notify('บันทึกการตั้งค่าการแจ้งเตือนและความผิดพลาดเรียบร้อยแล้ว');
      await reload?.();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <>
      <PageHead
        title="การแจ้งเตือน & ข้อผิดพลาดอุปกรณ์"
        description="ติดตามความผิดพลาดของอุปกรณ์ กำหนดลำดับความสำคัญ (Priority) และตั้งค่าเงื่อนไขการแจ้งเตือน"
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          className={`button ${activeTab === 'list' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('list')}
        >
          รายการแจ้งเตือนระบบ ({alerts.filter(a => a.status === 'active').length})
        </button>
        <button
          className={`button ${activeTab === 'settings' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('settings')}
        >
          ตั้งค่าเงื่อนไข & ลำดับความสำคัญ (Settings)
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
            <div className="stat red" style={{ cursor: 'pointer' }} onClick={() => { setPriorityFilter('CRITICAL'); setStatusFilter('active'); }}>
              <strong>{criticalCount}</strong>
              <span>🔴 วิกฤต (Critical)</span>
            </div>
            <div className="stat yellow" style={{ cursor: 'pointer' }} onClick={() => { setPriorityFilter('HIGH'); setStatusFilter('active'); }}>
              <strong>{highCount}</strong>
              <span>🟠 สำคัญ (High)</span>
            </div>
            <div className="stat blue" style={{ cursor: 'pointer' }} onClick={() => { setPriorityFilter('NORMAL'); setStatusFilter('active'); }}>
              <strong>{normalCount}</strong>
              <span>🟡 ทั่วไป (Normal/Info)</span>
            </div>
            <div className="stat green" style={{ cursor: 'pointer' }} onClick={() => { setPriorityFilter('all'); setStatusFilter('resolved'); }}>
              <strong>{resolvedCount}</strong>
              <span>🟢 ปิดงานแล้ว (Resolved)</span>
            </div>
          </div>

          {!liveAdmin?.line_user_id && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>🔴</span>
                <div>
                  <strong style={{ color: '#f87171', fontSize: 14 }}>
                    บัญชีแอดมินของคุณ ({liveAdmin?.name || 'Admin'}) ยังไม่ได้เชื่อมต่อ LINE
                  </strong>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#cbd5e1' }}>
                    เมื่อเกิดเหตุฉุกเฉินหรืออุปกรณ์ออฟไลน์ บอทจะไม่สามารถส่ง LINE Push แจ้งเตือนเข้ามือถือของคุณได้
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="button compact"
                  onClick={() => redirectToLine('link')}
                  style={{ background: '#06c755', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span>เชื่อมต่อ LINE ทันที</span>
                </button>
                <button
                  type="button"
                  className="button secondary compact"
                  onClick={() => setLineModalOpen(true)}
                >
                  ดูรหัสผูกแชทบอท
                </button>
              </div>
            </div>
          )}

          <section className="panel">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="ค้นหาหัวข้อ / ข้อความ / ช่องจอด..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ minWidth: 220, padding: '6px 12px', fontSize: 13, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
                />
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option style={optionStyle} value="all">ทุกระดับความสำคัญ</option>
                  <option style={{ ...optionStyle, color: '#f87171' }} value="CRITICAL">🔴 CRITICAL เท่านั้น</option>
                  <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH เท่านั้น</option>
                  <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL เท่านั้น</option>
                  <option style={{ ...optionStyle, color: '#c084fc' }} value="INFO">🔵 INFO เท่านั้น</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option style={optionStyle} value="all">ทุกสถานะ</option>
                  <option style={{ ...optionStyle, color: '#f87171' }} value="active">🔴 ยังไม่ดำเนินการ (Active)</option>
                  <option style={{ ...optionStyle, color: '#facc15' }} value="acknowledged">🟡 รับทราบแล้ว (Acknowledged)</option>
                  <option style={{ ...optionStyle, color: '#4ade80' }} value="resolved">🟢 ปิดงานแล้ว (Resolved)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button primary compact" onClick={() => setTestModal(true)}>
                  ทดสอบส่งแจ้งเตือน
                </button>
                {resolvedCount > 0 && (
                  <button className="button secondary compact" onClick={clearResolved}>
                    ล้างประวัติที่แก้ไขแล้ว
                  </button>
                )}
              </div>
            </div>

            {filtered.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(item => {
                  const style = getPriorityStyle(item.priority);
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: item.status === 'resolved' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${item.status === 'resolved' ? 'rgba(255,255,255,0.06)' : style.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: style.bg,
                            border: `1px solid ${style.border}`,
                            color: style.color
                          }}>
                            {style.label}
                          </span>
                          <strong style={{ fontSize: 14, color: '#f1f5f9' }}>{item.title}</strong>
                          {item.slot_id && (
                            <span style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                              ช่อง {item.slot_id}
                            </span>
                          )}
                          {item.device_id && (
                            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                              {item.device_id}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' })} น.
                          </span>
                          <span style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 4,
                            fontWeight: 600,
                            background: item.status === 'resolved' ? 'rgba(34,197,94,0.15)' : item.status === 'acknowledged' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                            color: item.status === 'resolved' ? '#4ade80' : item.status === 'acknowledged' ? '#facc15' : '#f87171'
                          }}>
                            {item.status === 'resolved' ? '🟢 ปิดงานแล้ว' : item.status === 'acknowledged' ? '🟡 รับทราบแล้ว' : '🔴 รอตรวจสอบ'}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                        {item.message}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {item.notified_line ? 'ส่งแจ้งเตือนเข้า LINE Admin แล้ว' : 'แจ้งเตือนในระบบ'}
                          {item.resolved_at && ` · ปิดงานเมื่อ ${new Date(item.resolved_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`}
                        </span>

                        <div style={{ display: 'flex', gap: 6 }}>
                          {item.status === 'active' && (
                            <button className="button secondary compact" onClick={() => acknowledge(item.id)}>
                              รับทราบปัญหา
                            </button>
                          )}
                          {item.status !== 'resolved' && (
                            <button className="button primary compact" onClick={() => resolve(item.id)}>
                              ปิดงานแก้ไขแล้ว
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                ไม่พบรายการแจ้งเตือนตามเงื่อนไขที่เลือก (ระบบทำงานปกติ)
              </p>
            )}
          </section>
        </>
      ) : (
        <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel">
            <h3 style={{ fontSize: 16, marginBottom: 12, color: 'var(--cyan)' }}>
              1. การตรวจจับความผิดพลาดของอุปกรณ์ (Hardware Faults)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_offline_alert)}
                    onChange={(e) => setConfig({ ...config, enable_offline_alert: e.target.checked })}
                  />
                  <span>แจ้งเตือนเมื่ออุปกรณ์ออฟไลน์ (Offline Timeout)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div>
                    <span className="muted">เวลาขาดการติดต่อ (วินาที): </span>
                    <input
                      type="number"
                      min={30}
                      max={600}
                      step={10}
                      value={config.offline_timeout_sec}
                      onChange={(e) => setConfig({ ...config, offline_timeout_sec: Number(e.target.value) })}
                      style={{ width: 90, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#f8fafc', border: '1.5px solid rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600 }}
                    /> วินาที
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="muted" style={{ fontWeight: 600 }}>ระดับความสำคัญ: </span>
                    <select
                      value={config.offline_priority}
                      onChange={(e) => setConfig({ ...config, offline_priority: e.target.value })}
                      style={selectStyle}
                    >
                      <option style={{ ...optionStyle, color: '#f87171' }} value="CRITICAL">🔴 CRITICAL (วิกฤต)</option>
                      <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ)</option>
                      <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL (ปานกลาง)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_barrier_fault_alert)}
                    onChange={(e) => setConfig({ ...config, enable_barrier_fault_alert: e.target.checked })}
                  />
                  <span>แจ้งเตือนเมื่อไม้กั้นเปิดค้างผิดปกติ (Barrier Stuck)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div>
                    <span className="muted">เปิดค้างเกิน (วินาที): </span>
                    <input
                      type="number"
                      min={60}
                      max={1800}
                      step={30}
                      value={config.barrier_stuck_sec}
                      onChange={(e) => setConfig({ ...config, barrier_stuck_sec: Number(e.target.value) })}
                      style={{ width: 90, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#f8fafc', border: '1.5px solid rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600 }}
                    /> วินาที ({Math.round((config.barrier_stuck_sec || 300) / 60)} นาที)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="muted" style={{ fontWeight: 600 }}>ระดับความสำคัญ: </span>
                    <select
                      value={config.barrier_fault_priority}
                      onChange={(e) => setConfig({ ...config, barrier_fault_priority: e.target.value })}
                      style={selectStyle}
                    >
                      <option style={{ ...optionStyle, color: '#f87171' }} value="CRITICAL">🔴 CRITICAL (วิกฤต)</option>
                      <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_sensor_flapping_alert)}
                    onChange={(e) => setConfig({ ...config, enable_sensor_flapping_alert: e.target.checked })}
                  />
                  <span>แจ้งเตือนเมื่อเซนเซอร์อ่านค่าสลับเร็ว (Flapping)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <span className="muted">ตรวจจับฝุ่นหรือสิ่งกีดขวางหน้าเซนเซอร์ที่ทำให้สัญญาณกระพริบต่อเนื่อง</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="muted" style={{ fontWeight: 600 }}>ระดับความสำคัญ: </span>
                    <select
                      value={config.sensor_flapping_priority}
                      onChange={(e) => setConfig({ ...config, sensor_flapping_priority: e.target.value })}
                      style={selectStyle}
                    >
                      <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ)</option>
                      <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL (ปานกลาง)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 16, marginBottom: 12, color: 'var(--cyan)' }}>
              2. การตรวจจับเหตุการณ์ระบบและการจอง (Operational Alerts)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_noshow_alert)}
                    onChange={(e) => setConfig({ ...config, enable_noshow_alert: e.target.checked })}
                  />
                  <span>แจ้งเตือนเมื่อตัดสิทธิ์ No-Show (เกิน 15 นาที)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 4 }}>
                  <span className="muted" style={{ fontWeight: 600 }}>ระดับความสำคัญ: </span>
                  <select
                    value={config.noshow_priority}
                    onChange={(e) => setConfig({ ...config, noshow_priority: e.target.value })}
                    style={selectStyle}
                  >
                    <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ)</option>
                    <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL (ปานกลาง)</option>
                  </select>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_overtime_alert)}
                    onChange={(e) => setConfig({ ...config, enable_overtime_alert: e.target.checked })}
                  />
                  <span>แจ้งเตือนเมื่อจอดรถเกินเวลา (Overtime เกิน 15 นาที)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 4 }}>
                  <span className="muted" style={{ fontWeight: 600 }}>ระดับความสำคัญ: </span>
                  <select
                    value={config.overtime_priority}
                    onChange={(e) => setConfig({ ...config, overtime_priority: e.target.value })}
                    style={selectStyle}
                  >
                    <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ)</option>
                    <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL (ปานกลาง)</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--cyan)' }}>
              3. ช่องทางการแจ้งเตือน & ป้องกันการรบกวน (Notification Channels)
            </h3>

            {/* กล่องสถานะ LINE ของผู้ดูแลระบบ (Admin LINE Status & Control) */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: liveAdmin?.line_user_id ? '1.5px solid rgba(16, 185, 129, 0.45)' : '1.5px solid rgba(239, 68, 68, 0.45)',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{liveAdmin?.line_user_id ? '🟢' : '🔴'}</span>
                    <strong style={{ fontSize: 15, color: '#f8fafc' }}>
                      สถานะ LINE ของคุณ ({liveAdmin?.name || 'Admin'}):
                    </strong>
                    <span className={`badge ${liveAdmin?.line_user_id ? 'available' : 'unavailable'}`} style={{ fontSize: 12, padding: '3px 8px' }}>
                      {liveAdmin?.line_user_id ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                    {liveAdmin?.line_user_id
                      ? 'คุณพร้อมรับข้อความแจ้งเตือนสถานะอุปกรณ์ผ่าน LINE Bot (@302ypwvm) แล้ว'
                      : 'บอทจะไม่สามารถส่งข้อความแจ้งเตือนหาคุณได้จนกว่าจะเชื่อมต่อบัญชี LINE'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {liveAdmin?.line_user_id ? (
                    <>
                      <button
                        type="button"
                        className="button primary compact"
                        disabled={testingMyLine}
                        onClick={async () => {
                          setTestingMyLine(true);
                          try {
                            await api('/auth/line/test-message', { method: 'POST' });
                            notify?.('ส่งข้อความทดสอบเข้า LINE มือถือของคุณสำเร็จแล้ว!', false);
                          } catch (e) {
                            notify?.(e.message || 'ส่งข้อความทดสอบไม่สำเร็จ', true);
                          } finally {
                            setTestingMyLine(false);
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                      >
                        <span>{testingMyLine ? 'กำลังส่ง...' : 'ทดสอบยิง LINE ถึงคุณ'}</span>
                      </button>
                      <a
                        href="https://line.me/R/ti/p/@302ypwvm"
                        target="_blank"
                        rel="noreferrer"
                        className="button secondary compact"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <span>เปิดแชท Bot</span>
                      </a>
                      <button
                        type="button"
                        className="button danger compact"
                        onClick={async () => {
                          if (!window.confirm('คุณต้องการยกเลิกการเชื่อมต่อ LINE ใช่หรือไม่?')) return;
                          try {
                            await api('/auth/line/unlink', { method: 'POST' });
                            notify?.('ยกเลิกการเชื่อมต่อ LINE แล้ว', false);
                            reload?.();
                          } catch (e) {
                            notify?.(e.message || 'เกิดข้อผิดพลาด', true);
                          }
                        }}
                      >
                        ยกเลิกการเชื่อมต่อ
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button compact"
                        onClick={() => redirectToLine('link')}
                        style={{ background: '#06c755', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <span>เชื่อมต่อด้วย LINE Login</span>
                      </button>
                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={() => setLineModalOpen(true)}
                      >
                        ดูรหัสผูกแชทบอท
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* รายชื่อแอดมินทั้งหมดในระบบ */}
              <div style={{ fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="muted" style={{ fontWeight: 600 }}>รายชื่อผู้ดูแลระบบในระบบ ({adminsList.length} ท่าน):</span>
                  <span style={{ color: readyAdminsCount > 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                    พร้อมรับ LINE: {readyAdminsCount} / {adminsList.length} ท่าน
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
                  {adminsList.map(a => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{a.line_user_id ? '🟢' : '🔴'}</span>
                        <div>
                          <strong style={{ color: '#f8fafc' }}>{a.name}</strong>
                          <div className="muted" style={{ fontSize: 11 }}>{a.username}</div>
                        </div>
                      </div>
                      <div>
                        {a.line_user_id ? (
                          <span className="badge available" style={{ fontSize: 11, padding: '2px 6px' }}>✓ เชื่อมต่อแล้ว</span>
                        ) : (
                          <span style={{ color: '#fbbf24', fontSize: 11, textAlign: 'right', display: 'block' }}>
                            รหัส: <code style={{ color: 'var(--cyan)', fontWeight: 700 }}>{a.line_link_code || '-'}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_line_admin_notify)}
                    onChange={(e) => setConfig({ ...config, enable_line_admin_notify: e.target.checked })}
                  />
                  <span>ส่งแจ้งเตือนเข้า LINE ของแอดมิน (LINE Push)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div>
                    <span className="muted" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>ส่งเฉพาะระดับ: </span>
                    <select
                      value={config.line_admin_min_priority}
                      onChange={(e) => setConfig({ ...config, line_admin_min_priority: e.target.value })}
                      style={{ ...selectStyle, width: '100%' }}
                    >
                      <option style={{ ...optionStyle, color: '#f87171' }} value="CRITICAL">🔴 ส่งเฉพาะระดับ CRITICAL เท่านั้น (วิกฤต)</option>
                      <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 ส่งระดับ HIGH ขึ้นไป (แนะนำ)</option>
                      <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 ส่งทุกระดับ</option>
                    </select>
                  </div>
                  <span className="muted">ช่วยกรองไม่ให้ส่งข้อความรบกวนแอดมินสำหรับเหตุการณ์ทั่วไป</span>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Cooldown ป้องกันส่งซ้ำ (Anti-Spam)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div>
                    <span className="muted">ระยะเวลากั้นส่งซ้ำ: </span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={config.cooldown_minutes}
                      onChange={(e) => setConfig({ ...config, cooldown_minutes: Number(e.target.value) })}
                      style={{ width: 80, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#f8fafc', border: '1.5px solid rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600 }}
                    /> นาที
                  </div>
                  <span className="muted">เมื่ออุปกรณ์หลุด จะไม่ยิง LINE ซ้ำจนกว่าจะพ้นระยะเวลานี้</span>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.enable_sound_alert)}
                    onChange={(e) => setConfig({ ...config, enable_sound_alert: e.target.checked })}
                  />
                  <span>เสียงแจ้งเตือนบนหน้าเว็บแดชบอร์ด (Audio Chime)</span>
                </label>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  ส่งเสียงปี๊บเตือนเมื่อมีแจ้งเตือนระดับ CRITICAL หรือเมื่อกดทดสอบแจ้งเตือน
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="submit" className="button primary" disabled={savingConfig}>
              {savingConfig ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าการแจ้งเตือน'}
            </button>
          </div>
        </form>
      )}

      {testModal && (
        <div className="modal-backdrop" onClick={() => setTestModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>ทดสอบส่งการแจ้งเตือน</h3>
            <form onSubmit={handleTestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>เลือกระดับความสำคัญ (Priority):</label>
                <select
                  value={testForm.priority}
                  onChange={(e) => setTestForm({ ...testForm, priority: e.target.value })}
                  style={{ ...selectStyle, width: '100%', padding: '10px 14px' }}
                >
                  <option style={{ ...optionStyle, color: '#f87171' }} value="CRITICAL">🔴 CRITICAL (วิกฤต - มีเสียงเตือน + ส่ง LINE ด่วน)</option>
                  <option style={{ ...optionStyle, color: '#fbbf24' }} value="HIGH">🟠 HIGH (สำคัญ - ส่ง LINE)</option>
                  <option style={{ ...optionStyle, color: '#38bdf8' }} value="NORMAL">🟡 NORMAL (ปานกลาง)</option>
                  <option style={{ ...optionStyle, color: '#c084fc' }} value="INFO">🔵 INFO (ข้อมูลทั่วไป)</option>
                </select>
              </div>

              <div className="field">
                <label>หัวข้อแจ้งเตือน:</label>
                <input
                  type="text"
                  required
                  value={testForm.title}
                  onChange={(e) => setTestForm({ ...testForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                />
              </div>

              <div className="field">
                <label>รายละเอียดข้อความ:</label>
                <textarea
                  rows={3}
                  required
                  value={testForm.message}
                  onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="button secondary" onClick={() => setTestModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="button primary" disabled={testSubmitting}>
                  {testSubmitting ? 'กำลังส่ง...' : 'ยืนยันการส่งทดสอบ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lineModalOpen && (
        <LineConnectModal
          user={liveAdmin}
          onClose={() => setLineModalOpen(false)}
          notify={notify}
          reload={reload}
        />
      )}
    </>
  );
}

function AdminLayout({ data, reload, notify }) {
  const [selected, setSelected] = useState(null);
  const [floor, setFloor] = useState(1);
  const [lightboxMap, setLightboxMap] = useState(null);
  const [slotToEdit, setSlotToEdit] = useState(null);
  const [editPrice, setEditPrice] = useState(20);
  const [editType, setEditType] = useState('ลูกค้าทั่วไป');
  const [editTypePreset, setEditTypePreset] = useState('ลูกค้าทั่วไป');
  const [editCode, setEditCode] = useState('');

  const slots = data.slots.filter((slot) => Number(slot.floor) === Number(floor)).sort((a, b) => a.slot_order - b.slot_order);
  const maps = (data.parking_maps || []).filter((item) => Number(item.floor) === Number(floor)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const activeMap = maps[0] || null;
  const placedSlots = slots.filter((s) => s.pos_x != null && s.pos_y != null);
  const unplacedSlots = slots.filter((s) => s.pos_x == null || s.pos_y == null);
  const openMaintenance = (data.maintenance_logs || []).filter((item) => item.status === 'open');

  async function patchSlot(slot, patch) {
    try {
      await api(`/admin/slots/${slot.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await reload?.();
    } catch (err) {
      notify(err.message, true);
    }
  }

  const openEditModal = (slot) => {
    setSlotToEdit(slot);
    setEditPrice(Number(slot.price_per_hour || 20));
    setEditCode(slot.code);
    const rawType = slot.type || 'ลูกค้าทั่วไป';
    const normalizedType = rawType === 'ปกติ' ? 'ลูกค้าทั่วไป' : rawType;
    const isStandard = ['ลูกค้าทั่วไป', 'สมาชิก', 'ผู้พิการ', 'ชาร์จ EV'].includes(normalizedType);
    if (isStandard) {
      setEditTypePreset(normalizedType);
      setEditType(normalizedType);
    } else {
      setEditTypePreset('custom');
      setEditType(rawType);
    }
  };

  const saveSlotSettings = async () => {
    if (!slotToEdit) return;
    const finalType = editTypePreset === 'custom' ? (editType.trim() || 'ลูกค้าทั่วไป') : editTypePreset;
    const finalPrice = Math.max(0, Number(editPrice || 0));
    const finalCode = editCode.trim() || slotToEdit.code;

    try {
      await patchSlot(slotToEdit, {
        code: finalCode,
        price_per_hour: finalPrice,
        type: finalType
      });
      setSlotToEdit(null);
      notify(`บันทึกการตั้งค่าช่อง ${finalCode} เรียบร้อยแล้ว (฿${finalPrice}/ชม. · ${finalType})`);
    } catch (err) {
      notify(err.message, true);
    }
  };

  const placeSlotOnMap = async (slot) => {
    const defaultX = 50 + (((slot.slot_order || 0) % 3) - 1) * 14;
    const defaultY = 45 + Math.floor((slot.slot_order || 0) / 3) * 14;
    try {
      await patchSlot(slot, { pos_x: defaultX, pos_y: defaultY });
      notify(`นำช่อง ${slot.code} วางบนผังแล้ว ลากไปยังตำแหน่งที่ต้องการได้เลย`);
    } catch (err) {
      notify(err.message, true);
    }
  };

  async function rename(slot) { const code = window.prompt('ชื่อช่องจอดใหม่', slot.code); if (code) patchSlot(slot, { code }); }
  async function chooseSwap(slot) { if (!selected) return setSelected(slot.id); if (selected === slot.id) return setSelected(null); try { await api('/admin/slots/swap', { method: 'POST', body: JSON.stringify({ firstId: selected, secondId: slot.id }) }); setSelected(null); notify('สลับตำแหน่งช่องจอดแล้ว'); } catch (err) { notify(err.message, true); } }
  async function maintenance(slot, defaultReason = 'ปิดปรับปรุง / ซ่อมบำรุง') {
    const input = window.prompt(`รายละเอียดการแจ้งซ่อมช่อง ${slot.code}`, defaultReason);
    if (input === null) return false;
    const problemDetail = input.trim() || defaultReason;
    try {
      await api('/admin/maintenance', { method: 'POST', body: JSON.stringify({ slotId: slot.id, problemDetail }) });
      notify(`แจ้งซ่อมช่อง ${slot.code} แล้ว (${problemDetail})`);
      return true;
    } catch (err) {
      notify(err.message, true);
      return false;
    }
  }
  async function resolve(item) { try { await api(`/admin/maintenance/${item.id}/resolve`, { method: 'POST' }); notify('ปิดงานซ่อมและคืนสถานะช่องว่างแล้ว'); } catch (err) { notify(err.message, true); } }
  async function uploadMap(event) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    form.set('floor', floor);
    try {
      await api('/admin/maps', { method: 'POST', body: form });
      formEl?.reset();
      await reload?.();
      notify('อัปโหลดผังลานจอดแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function renameMap(item) {
    const newName = window.prompt('ชื่อผังใหม่', item.name);
    if (!newName || newName === item.name) return;
    try { await api(`/admin/maps/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) }); await reload?.(); notify('เปลี่ยนชื่อผังแล้ว'); }
    catch (err) { notify(err.message, true); }
  }
  async function replaceMapImage(item, file) {
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    try {
      notify('กำลังอัปโหลดเปลี่ยนรูปผังใหม่...');
      await api(`/admin/maps/${item.id}`, { method: 'PATCH', body: form });
      await reload?.();
      notify('เปลี่ยนรูปภาพผังลานจอดสำเร็จแล้ว');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function deleteMap(item) {
    if (!window.confirm(`ยืนยันการลบผัง "${item.name}" หรือไม่?\nรูปภาพจะถูกลบออกจากระบบถาวร`)) return;
    try { await api(`/admin/maps/${item.id}`, { method: 'DELETE' }); await reload?.(); notify('ลบผังลานจอดแล้ว'); }
    catch (err) { notify(err.message, true); }
  }

  return (
    <>
      <PageHead title="จัดการผังลานจอด" description="ลากวางช่องจอดบนรูปภาพแปลน กำหนดประเภทช่องจอด และแก้ไขราคาค่าจอดแต่ละช่อง" />
      <div className="tabs">
        <button className={floor === 1 ? 'active' : ''} onClick={() => setFloor(1)}>ชั้น 1 (A1 - A6)</button>
        <button className={floor === 2 ? 'active' : ''} onClick={() => setFloor(2)}>ชั้น 2 (B1 - B6)</button>
      </div>

      {/* ─── รูปผังลานจอดและการลากวางช่องจอด ─── */}
      <section className="panel">
        <div className="panel-title">
          <h2>ผังลานจอด · ชั้น {floor}</h2>
          <span className="muted">{maps.length} รูป</span>
        </div>

        {/* อัปโหลดรูปใหม่ */}
        <form className="booking-fields" onSubmit={uploadMap} style={{ marginBottom: maps.length ? 20 : 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 5, fontWeight: 600 }}>ชื่อผัง</label>
              <input name="name" required placeholder={`เช่น ผังชั้น ${floor} อาคาร A`} style={{ margin: 0 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 5, fontWeight: 600 }}>ไฟล์รูปภาพแปลน (PNG / JPG / WebP)</label>
              <input name="image" type="file" accept="image/png,image/jpeg,image/webp" required style={{ margin: 0 }} />
            </div>
            <button type="submit" className="button primary" style={{ alignSelf: 'end', whiteSpace: 'nowrap' }}>+ อัปโหลดรูป</button>
          </div>
        </form>

        {/* แคนวาสแผนที่แบบลากวาง */}
        {activeMap && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 15, color: '#fff' }}>ผังแปลนจริงแบบลากวาง ({activeMap.name})</strong>
                <span style={{ fontSize: 11, color: 'var(--cyan)', background: 'rgba(54,220,201,0.12)', border: '1px solid rgba(54,220,201,0.3)', padding: '2px 8px', borderRadius: 999 }}>
                  วางแล้ว {placedSlots.length}/{slots.length} ช่อง
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                <strong>วิธีใช้:</strong> คลิกลากช่องจอดไปวางที่ตำแหน่งจริงบนรูปภาพ | คลิกที่ช่องเพื่อแก้ไขราคาและประเภท
              </div>
            </div>

            <InteractiveFloorMap
              map={activeMap}
              slots={slots}
              devices={data.devices}
              isAdmin={true}
              onSlotClick={(slot) => openEditModal(slot)}
              onSlotMove={async (slot, x, y) => {
                await patchSlot(slot, { pos_x: x, pos_y: y });
                notify(`บันทึกตำแหน่งช่อง ${slot.code} บนผังแล้ว (${x}%, ${y}%)`);
              }}
              selectedSlotId={selected}
            />

            {/* ถาดช่องจอดที่ยังไม่ได้วาง */}
            {unplacedSlots.length > 0 && (
              <div className="unplaced-tray">
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  ช่องจอดที่ยังไม่ได้วางตำแหน่ง ({unplacedSlots.length} ช่อง):
                </span>
                {unplacedSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className="unplaced-badge"
                    onClick={() => placeSlotOnMap(slot)}
                    title="คลิกเพื่อนำช่องจอดนี้ขึ้นไปวางบนผัง"
                  >
                    <strong>+ วาง {slot.code}</strong>
                    <span style={{ color: '#fbbf24', fontSize: 11 }}>฿{slot.price_per_hour || 20}</span>
                  </button>
                ))}
              </div>
            )}

            {/* แถบจัดการรูปภาพ */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="button compact"
                onClick={() => setLightboxMap(activeMap)}
              >ดูรูปเต็ม</button>
              <label
                className="button compact"
                style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center' }}
              >
                เปลี่ยนรูปภาพ
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      replaceMapImage(activeMap, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="button compact"
                onClick={() => renameMap(activeMap)}
              >เปลี่ยนชื่อ</button>
              <button
                type="button"
                className="button danger compact"
                onClick={() => deleteMap(activeMap)}
              >ลบ</button>
            </div>
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightboxMap && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setLightboxMap(null)}
          style={{ alignItems: 'center', padding: 20 }}
        >
          <div onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#fff', fontSize: 16 }}>{lightboxMap.name}</strong>
              <button className="button compact" onClick={() => setLightboxMap(null)}>✕ ปิด</button>
            </div>
            <img
              src={lightboxMap.image_url}
              alt={lightboxMap.name}
              style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 60px)', objectFit: 'contain', borderRadius: 12, background: '#101820' }}
            />
          </div>
        </div>
      )}

      {/* ─── ผังช่องจอด (ตารางรายละเอียดและการตั้งค่า) ─── */}
      <section className="panel">
        <div className="panel-title">
          <h2>รายละเอียดช่องจอด · ชั้น {floor}</h2>
          <span className="muted">{slots.length} ช่อง</span>
        </div>
        <div className="slot-grid">
          {slots.map((slot) => {
            const sensor = (data.devices || []).find((d) => d.type === 'sensor' && d.linked_slot === slot.id);
            const isCarPresent = sensor?.status === 'online' && (sensor?.presence === 'occupied' || sensor?.car_present === true);
            const sensorDotClass = !sensor || sensor.status !== 'online' ? 'offline' : (isCarPresent ? 'occupied' : 'empty');
            const typeMeta = getSlotTypeMeta(slot.type);

            return (
              <div className={`slot-card ${slot.status}`} key={slot.id} style={selected === slot.id ? { outline: '2px solid #22d3ee' } : {}}>
                <span className={`sensor-dot ${sensorDotClass}`} title={isCarPresent ? 'เซ็นเซอร์: ตรวจพบวัตถุ (สีแดง)' : 'เซ็นเซอร์: ว่าง (สีเขียว)'} />
                <div className="slot-top">
                  <strong>{slot.code}</strong>
                  <span className={`slot-type-pill ${typeMeta.className}`}>{typeMeta.label}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', margin: '4px 0 8px' }}>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>฿{slot.price_per_hour || 20}/ชม.</span>
                  <span style={{ fontSize: 10.5, color: slot.pos_x != null ? 'var(--cyan)' : 'var(--muted)' }}>
                    {slot.pos_x != null ? `บนผัง (${slot.pos_x}%, ${slot.pos_y}%)` : 'ยังไม่วางบนผัง'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', marginBottom: 6 }}>
                  <button className="button compact primary" onClick={() => openEditModal(slot)}>ตั้งค่า</button>
                  {slot.pos_x == null ? (
                    <button className="button compact" onClick={() => placeSlotOnMap(slot)}>วางบนผัง</button>
                  ) : (
                    <button className="button compact" onClick={() => chooseSwap(slot)}>{selected === slot.id ? 'ยกเลิกสลับ' : 'สลับลำดับ'}</button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, width: '100%' }}>
                  <select
                    value={slot.status}
                    onChange={async (e) => {
                      const nextVal = e.target.value;
                      if (nextVal === 'unavailable') {
                        await maintenance(slot);
                      } else if (slot.status === 'unavailable' && nextVal === 'available') {
                        const openJob = (data.maintenance_logs || []).find((m) => m.slot_id === slot.id && m.status === 'open');
                        if (openJob) {
                          await resolve(openJob);
                        } else {
                          await patchSlot(slot, { status: 'available' });
                        }
                      } else {
                        await patchSlot(slot, { status: nextVal });
                      }
                    }}
                  >
                    <option value="available">ว่าง</option>
                    <option value="booked">ถูกจอง</option>
                    <option value="unavailable">ไม่พร้อม/ซ่อม</option>
                  </select>

                  {openMaintenance.some((m) => m.slot_id === slot.id) ? (
                    <button
                      className="button primary compact"
                      title="ปิดงานซ่อมและคืนสถานะช่องว่าง"
                      onClick={() => {
                        const openJob = openMaintenance.find((m) => m.slot_id === slot.id);
                        if (openJob) resolve(openJob);
                      }}
                    >
                      ซ่อมเสร็จ
                    </button>
                  ) : (
                    <button className="button danger compact" onClick={() => maintenance(slot)}>
                      แจ้งซ่อม
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── โมดอลแก้ไขราคา ประเภท และรายละเอียดช่องจอด ─── */}
      {slotToEdit && (
        <div className="modal-backdrop" onMouseDown={() => setSlotToEdit(null)}>
          <div className="slot-edit-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#fff' }}>จัดการช่องจอด {slotToEdit.code}</h3>
              <button type="button" className="modal-close" onClick={() => setSlotToEdit(null)}>✕</button>
            </div>

            <div className="slot-edit-field">
              <label className="slot-edit-label">
                ชื่อ / รหัสช่องจอด
              </label>
              <input
                className="slot-edit-input"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                placeholder="เช่น A1, B2..."
              />
            </div>

            <div className="slot-edit-field">
              <label className="slot-edit-label">
                ราคาค่าจอดต่อชั่วโมง
              </label>
              <div className="slot-edit-input-group">
                <input
                  type="number"
                  min="0"
                  step="5"
                  className="slot-edit-input"
                  style={{ border: 'none', background: 'transparent', fontWeight: 700, color: '#facc15', fontSize: 16 }}
                  value={editPrice}
                  onChange={(e) => setEditPrice(Math.max(0, Number(e.target.value)))}
                />
                <span className="slot-edit-input-suffix">บาท/ชม.</span>
              </div>
            </div>

            <div className="slot-edit-field">
              <label className="slot-edit-label">
                ประเภทช่องจอด
              </label>
              <select
                className="slot-edit-input"
                value={editTypePreset}
                onChange={(e) => {
                  setEditTypePreset(e.target.value);
                  if (e.target.value !== 'custom') setEditType(e.target.value);
                }}
              >
                <option value="ลูกค้าทั่วไป">ลูกค้าทั่วไป (General)</option>
                <option value="สมาชิก">สมาชิก (VIP / Member)</option>
                <option value="ผู้พิการ">ผู้พิการ (Accessible)</option>
                <option value="ชาร์จ EV">ชาร์จ EV (EV Charging)</option>
                <option value="custom">+ กำหนดประเภทเอง...</option>
              </select>
            </div>

            {editTypePreset === 'custom' && (
              <div className="slot-edit-field">
                <label className="slot-edit-label" style={{ color: 'var(--cyan)' }}>
                  ระบุชื่อประเภทช่องจอดเอง
                </label>
                <input
                  className="slot-edit-input"
                  placeholder="พิมพ์ประเภทช่องจอด เช่น รถตู้ VIP, ผู้บริหาร..."
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* ─── ควบคุมไม้กั้นประจำช่องจอด ─── */}
            {(() => {
              const barrierDevice = (data.devices || []).find((d) => d.type === 'barrier' && (d.linked_slot === slotToEdit.id || d.linked_slot === slotToEdit.code));
              if (!barrierDevice) return null;
              return (
                <div style={{ marginTop: 12, marginBottom: 6, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>ไม้กั้นช่อง {slotToEdit.code}:</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: barrierDevice.state === 'open' ? 'var(--green)' : '#f87171' }}>
                      {barrierDevice.state === 'open' ? '🟢 เปิดอยู่ (ยกขึ้น)' : '🔴 ปิดอยู่ (กั้นช่อง)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`button full ${barrierDevice.state === 'open' ? 'danger' : 'primary'}`}
                    style={{ fontSize: 13, padding: '8px 12px' }}
                    onClick={async () => {
                      try {
                        await api(`/devices/${barrierDevice.id}/toggle`, { method: 'POST' });
                        await reload?.();
                        notify(`สั่ง${barrierDevice.state === 'open' ? 'ปิด' : 'เปิด'}ไม้กั้นช่อง ${slotToEdit.code} เรียบร้อยแล้ว`);
                      } catch (err) {
                        notify(err.message, true);
                      }
                    }}
                  >
                    {barrierDevice.state === 'open' ? 'สั่งปิดไม้กั้น' : 'สั่งเปิดไม้กั้น'}
                  </button>
                </div>
              );
            })()}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="button primary"
                onClick={saveSlotSettings}
              >
                บันทึกการเปลี่ยนแปลง
              </button>

              {slotToEdit.pos_x != null && (
                <button
                  type="button"
                  className="button compact"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', background: 'transparent' }}
                  onClick={async () => {
                    await patchSlot(slotToEdit, { pos_x: null, pos_y: null });
                    setSlotToEdit(null);
                    notify(`ลบตำแหน่งช่อง ${slotToEdit.code} ออกจากผังรูปภาพแล้ว`);
                  }}
                >
                  ลบตำแหน่งออกจากผังรูปภาพ
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ประวัติการซ่อมบำรุง ─── */}
      <section className="panel">
        <div className="panel-title">
          <h2>ประวัติการซ่อมบำรุง</h2>
          <span className="muted">{(data.maintenance_logs || []).length} รายการ</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ช่องจอด</th><th>รายละเอียดปัญหา</th><th>สถานะ</th><th>แจ้งเมื่อ</th><th>ปิดงานเมื่อ</th><th /></tr></thead>
            <tbody>
              {(data.maintenance_logs || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).map((item) => (
                <tr key={item.id}>
                  <td>{item.slot_id}</td>
                  <td>{item.problem_detail}</td>
                  <td><span className={`badge ${item.status === 'open' ? 'unavailable' : 'available'}`}>{item.status === 'open' ? 'กำลังซ่อม' : 'ปิดงานแล้ว'}</span></td>
                  <td>{new Date(item.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                  <td>{item.resolved_at ? new Date(item.resolved_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-'}</td>
                  <td>{item.status === 'open' && <button className="button primary compact" onClick={() => resolve(item)}>ซ่อมเสร็จ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.user || 'null'); } catch { localStorage.clear(); return null; } });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState(() => { try { return JSON.parse(localStorage.user || 'null')?.role === 'admin' ? 'dashboard' : 'booking'; } catch { return 'booking'; } });
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const inFlightRef = useRef(false);

  async function load(isInitial = false) {
    if (!localStorage.token) { localStorage.clear(); setUser(null); return; }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // แสดงสถานะ Loading และเคลียร์ Error เฉพาะตอนเปิดเว็บครั้งแรก เพื่อไม่ให้หน้าจอกระพริบ
    if (isInitial || !data) {
      setLoading(true);
      setLoadError('');
    }

    try {
      const next = await api('/bootstrap');
      setData(next);
      setLastUpdated(new Date());
      setLoadError('');

      const liveUser = next.users?.find((item) => item.id === user?.id);
      if (liveUser) {
        localStorage.user = JSON.stringify(liveUser);
        // อัปเดต user เฉพาะเมื่อข้อมูลเปลี่ยนจริง ไม่ clone object ใหม่ทุกวินาที
        setUser((current) => {
          if (!current) return liveUser;
          if (
            current.credit !== liveUser.credit ||
            current.role !== liveUser.role ||
            current.name !== liveUser.name ||
            current.line_user_id !== liveUser.line_user_id
          ) {
            return { ...current, ...liveUser };
          }
          return current;
        });
      }
    } catch (err) {
      if (err.status === 401) { localStorage.clear(); setUser(null); setData(null); return; }
      if (isInitial || !data) {
        setLoadError(err instanceof TypeError ? 'เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจสอบว่า Backend เปิดที่ Port 3000' : err.message);
      }
    } finally {
      inFlightRef.current = false;
      if (isInitial || !data) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!user) return;
    load(true);
    // Polling ทุก 3 วินาที (จากเดิม 1 วินาที) เพื่อลดภาระและป้องกันหน้าจอกระตุก
    const interval = setInterval(() => load(false), 3000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const redirectUri = window.location.origin;
      setLoading(true);
      api('/auth/line', { method: 'POST', body: JSON.stringify({ code, redirectUri }) })
        .then((res) => {
          if (res.mode === 'linked') {
            localStorage.user = JSON.stringify(res.user);
            setUser((curr) => ({ ...curr, ...res.user }));
            setNotice({ text: 'เชื่อมต่อ LINE สำเร็จแล้ว! พร้อมรับการแจ้งเตือนทันที', error: false });
            load();
          } else {
            localStorage.token = res.token;
            localStorage.user = JSON.stringify(res.user);
            setUser(res.user);
            setData(null);
            setView(res.user.role === 'admin' ? 'dashboard' : 'booking');
            setNotice({ text: `ยินดีต้อนรับคุณ ${res.user.name} เข้าสู่ระบบสำเร็จ`, error: false });
          }
        })
        .catch((err) => {
          setNotice({ text: err.message || 'เชื่อมต่อ LINE ไม่สำเร็จ', error: true });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []);

  const notify = (text, error = false) => { setNotice({ text, error }); load(); };
  const logout = () => { localStorage.clear(); setUser(null); setData(null); setLoadError(''); };

  if (!user) return <Login onLogin={(next) => { setUser(next); setData(null); setView(next.role === 'admin' ? 'dashboard' : 'booking'); }} />;
  if (loading && !data) return <div className="loading"><div><div className="loading-spinner" /><p>กำลังโหลดข้อมูลระบบ...</p></div></div>;
  if (loadError && !data) return <div className="loading"><div className="load-error"><h2>เชื่อมต่อระบบไม่สำเร็จ</h2><p>{loadError}</p><div><button className="button primary" onClick={load}>ลองใหม่</button><button className="button" onClick={logout}>กลับไปเข้าสู่ระบบ</button></div><small>ทดสอบ Backend ที่ http://localhost:3000/api/health</small></div></div>;
  if (!data) return <div className="loading"><button className="button primary" onClick={load}>โหลดข้อมูลระบบ</button></div>;

  const liveUser = data.users.find((item) => item.id === user.id) || user;
  const activeAlertCount = (data?.system_alerts || []).filter(a => a.status === 'active').length;
  const content = liveUser.role === 'admin'
    ? { dashboard: <AdminDashboard data={data} setView={setView} />, analytics: <AdminAnalytics data={data} />, users: <AdminUsers data={data} notify={notify} />, devices: <AdminDevices data={data} reload={load} notify={notify} />, alerts: <AdminAlerts data={data} user={liveUser} reload={load} notify={notify} />, layout: <AdminLayout data={data} reload={load} notify={notify} /> }[view]
    : { booking: <UserBooking data={data} user={liveUser} notify={notify} setView={setView} />, control: <UserControl data={data} user={liveUser} notify={notify} />, history: <UserHistory data={data} user={liveUser} notify={notify} /> }[view];
  return <div className="app-shell"><Header user={liveUser} onLogout={logout} lastUpdated={lastUpdated} data={data} setView={setView} notify={notify} reload={load} /><div className="body-shell"><Sidebar user={liveUser} view={view} setView={setView} activeAlertCount={activeAlertCount} /><main className="content">{notice && <div className={`alert ${notice.error ? 'error' : 'success'}`}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}{loadError && <div className="alert error">{loadError}<button onClick={load}>ลองใหม่</button></div>}<ErrorBoundary key={view}>{content}</ErrorBoundary></main></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
