import React, { useState, useEffect, useRef } from 'react';

export default function StrictHabitTracker() {
  const [habits, setHabits] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [currentHabit, setCurrentHabit] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [checkedPresence, setCheckedPresence] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Telegram integration
  const BOT_TOKEN = '8664151607:AAHHy9RDEN3gx2iNn_QNFM7Qhyw2dIIdm3Y';
  const [telegramChatId, setTelegramChatId] = useState(localStorage.getItem('telegram_chat_id') || '');
  const [telegramUsername, setTelegramUsername] = useState(localStorage.getItem('telegram_username') || '');
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [lastUpdateId, setLastUpdateId] = useState(0);
  
  // Form state
  const [habitName, setHabitName] = useState('');
  const [habitTime, setHabitTime] = useState('12:00');
  const [habitDays, setHabitDays] = useState({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true
  });
  const [useTelegramUnlock, setUseTelegramUnlock] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const audioContextRef = useRef(null);
  const intervalRef = useRef(null); // для повторяющегося звука

  // Telegram polling
  useEffect(() => {
    if (!telegramChatId) return;

    const pollTelegram = async () => {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
        );
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            setLastUpdateId(update.update_id);

            if (update.message) {
              const message = update.message;
              const chatId = message.chat.id.toString();

              if (message.text === '/start') {
                await sendTelegramMessage(chatId, 
                  `✅ Привет! Твой Chat ID: ${chatId}\n\nВведи этот ID в приложении.\n\nКоманды:\n/unlock - Разблокировать\n/status - Статус`
                );
              } else if (message.text === '/unlock' && chatId === telegramChatId) {
                if (isLocked && currentHabit?.useTelegramUnlock) {
                  completeHabit();
                  await sendTelegramMessage(chatId, '🔓 Разблокировано! Привычка засчитана.');
                } else {
                  await sendTelegramMessage(chatId, 'Нечего разблокировать: нет активной блокировки или привычка не требует Telegram.');
                }
              } else if (message.text === '/status' && chatId === telegramChatId) {
                const statusText = habits.length > 0
                  ? habits.map(h => `${h.completedToday ? '✅' : '⏳'} ${h.name} - ${h.time}`).join('\n')
                  : 'Нет привычек';
                await sendTelegramMessage(chatId, `📊 Твои привычки:\n\n${statusText}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Telegram polling error:', error);
      }
    };

    const interval = setInterval(pollTelegram, 2000);
    return () => clearInterval(interval);
  }, [telegramChatId, lastUpdateId, isLocked, currentHabit, habits]);

  const sendTelegramMessage = async (chatId, text) => {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  };

  const saveTelegramSettings = () => {
    localStorage.setItem('telegram_chat_id', telegramChatId);
    localStorage.setItem('telegram_username', telegramUsername);
    setShowTelegramSetup(false);
    alert('✅ Telegram подключен! Теперь можно разблокировать командой /unlock');
  };

  // Check for due habits every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
      
      habits.forEach(habit => {
        if (habit.time === currentTime && habit.days[currentDay] && !habit.completedToday) {
          triggerHabit(habit);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [habits]);

  // Громкий и повторяющийся звук
  const playAlarmSound = () => {
    if (!soundEnabled) return;
    stopAlarmSound(); // останавливаем старый цикл
    
    const playBeep = () => {
      try {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        const ctx = audioContextRef.current;
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = 880; // высокая нота, слышно лучше
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.25, ctx.currentTime); // громкость 0.25
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
        
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.8);
        
        // Автоматическое закрытие контекста после звука
        setTimeout(() => {
          if (audioContextRef.current === ctx) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
        }, 1000);
      } catch(e) { console.error(e); }
    };
    
    // Первый писк сразу
    playBeep();
    // Повторять каждые 2 секунды, пока не разблокируют
    intervalRef.current = setInterval(() => {
      if (isLocked) {
        playBeep();
      } else {
        stopAlarmSound();
      }
    }, 2000);
  };

  const stopAlarmSound = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const triggerHabit = (habit) => {
    setCurrentHabit(habit);
    setIsLocked(true);
    setCheckedPresence(false);
    setConfirmText('');
    
    if (soundEnabled) {
      playAlarmSound();
    }
    
    // Запрос полноэкранного режима и блокировка кнопки назад
    enterFullscreen();
    blockBackButton();
  };

  const handlePresenceCheck = () => {
    setCheckedPresence(true);
    // Не останавливаем звук до разблокировки
  };

  const handleUnlock = () => {
    if (confirmText.toLowerCase() === 'я клянусь жопой') {
      if (currentHabit.useTelegramUnlock) {
        alert('⚠️ Эта привычка требует разблокировки через Telegram бота!\nОтправь команду /unlock в бот.');
      } else {
        completeHabit();
      }
    } else {
      alert('❌ Неправильная фраза! Напиши точно: "Я клянусь жопой"');
    }
  };

  const completeHabit = () => {
    setHabits(habits.map(h => 
      h.id === currentHabit.id 
        ? { ...h, completedToday: true, lastCompleted: new Date().toISOString() }
        : h
    ));
    setIsLocked(false);
    setCurrentHabit(null);
    setConfirmText('');
    setCheckedPresence(false);
    stopAlarmSound();
    exitFullscreen();
    unblockBackButton();
  };

  const addHabit = () => {
    if (!habitName || !habitTime) {
      alert('Заполни название и время!');
      return;
    }
    const newHabit = {
      id: Date.now(),
      name: habitName,
      time: habitTime,
      days: { ...habitDays },
      useTelegramUnlock,
      completedToday: false,
      lastCompleted: null,
      createdAt: new Date().toISOString()
    };
    setHabits([...habits, newHabit]);
    resetForm();
    setShowAddForm(false);
  };

  const resetForm = () => {
    setHabitName('');
    setHabitTime('12:00');
    setHabitDays({
      mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true
    });
    setUseTelegramUnlock(false);
  };

  const deleteHabit = (id) => {
    if (confirm('Удалить эту привычку?')) {
      setHabits(habits.filter(h => h.id !== id));
    }
  };

  const getDayLabel = (day) => {
    const labels = {
      mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт',
      fri: 'Пт', sat: 'Сб', sun: 'Вс'
    };
    return labels[day];
  };

  // Сброс статуса в полночь
  useEffect(() => {
    const checkMidnight = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        setHabits(prevHabits => prevHabits.map(h => ({ ...h, completedToday: false })));
      }
    }, 60000);
    return () => clearInterval(checkMidnight);
  }, []);

  // Функции для полноэкранного режима и блокировки кнопки "Назад"
  const enterFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  };

  const blockBackButton = () => {
    // Перехват кнопки "Назад" в Android
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function onPopState() {
      window.history.pushState(null, null, window.location.href);
      alert('❌ Нельзя выйти, пока не выполнишь привычку!');
    });
  };

  const unblockBackButton = () => {
    window.removeEventListener('popstate', this);
    // Опционально: восстановить историю
  };

  // ------------- Рендер блокировки -------------
  if (isLocked) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '20px',
        zIndex: 9999,
        animation: 'pulse 2s infinite'
      }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.8; } }
          @keyframes shake { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
        `}</style>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '72px', marginBottom: '30px', animation: 'shake 0.5s infinite' }}>⚠️</div>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '20px', textShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>ВРЕМЯ!</h1>
          <div style={{ background: 'rgba(255,255,255,0.2)', padding: '30px', borderRadius: '15px', marginBottom: '30px', backdropFilter: 'blur(10px)' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '10px' }}>{currentHabit?.name}</h2>
            <p style={{ fontSize: '20px', opacity: 0.9 }}>{currentHabit?.time}</p>
            {currentHabit?.useTelegramUnlock && (
              <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '14px' }}>
                🔐 Разблокировка через Telegram
              </div>
            )}
          </div>

          {!checkedPresence ? (
            <button
              onClick={handlePresenceCheck}
              style={{
                width: '100%', padding: '20px', fontSize: '24px', fontWeight: 'bold',
                background: 'white', color: '#dc2626', border: 'none', borderRadius: '10px',
                cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s'
              }}
              onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              ✓ Я ТУТ
            </button>
          ) : (
            <div>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Напиши: "Я клянусь жопой"'
                style={{
                  width: '100%', padding: '20px', fontSize: '18px', borderRadius: '10px',
                  border: '3px solid white', marginBottom: '15px', textAlign: 'center',
                  background: 'white', color: '#1f2937', fontWeight: 'bold'
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              />
              <button
                onClick={handleUnlock}
                style={{
                  width: '100%', padding: '20px', fontSize: '24px', fontWeight: 'bold',
                  background: 'white', color: '#dc2626', border: 'none', borderRadius: '10px',
                  cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.3)'
                }}
              >
                🔓 РАЗБЛОКИРОВАТЬ
              </button>
              {currentHabit?.useTelegramUnlock && (
                <button
                  onClick={completeHabit}
                  style={{
                    width: '100%', padding: '15px', fontSize: '14px', background: 'rgba(255,255,255,0.3)',
                    color: 'white', border: '2px solid white', borderRadius: '8px', marginTop: '15px', cursor: 'pointer'
                  }}
                >
                  📱 Симуляция: Telegram /unlock
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------- Основной интерфейс -------------
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        padding: '30px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '10px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            💪 Strict Habits
          </h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowTelegramSetup(!showTelegramSetup)}
              style={{ padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', background: '#0088cc', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
            >
              {telegramChatId ? '✅ Telegram' + (telegramUsername ? ` (${telegramUsername})` : '') : '📎 Подключить Telegram'}
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{ padding: '12px 24px', fontSize: '18px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
            >
              {showAddForm ? '✕ Закрыть' : '+ Новая привычка'}
            </button>
          </div>
        </div>

        {showTelegramSetup && (
          <div style={{ background: '#e0f2fe', padding: '20px', borderRadius: '15px', marginBottom: '20px' }}>
            <h3 style={{ fontWeight: 'bold', marginBottom: '10px' }}>🔧 Подключение Telegram бота</h3>
            <p style={{ marginBottom: '10px', fontSize: '14px' }}>
              1. Напиши <strong>@strict_habits_bot</strong> команду <strong>/start</strong><br/>
              2. Скопируй полученный Chat ID<br/>
              3. Вставь ниже и сохрани
            </p>
            <input type="text" placeholder="Chat ID" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
            <input type="text" placeholder="Username (опционально)" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
            <button onClick={saveTelegramSettings} style={{ width: '100%', padding: '12px', background: '#0088cc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Сохранить</button>
          </div>
        )}

        {showAddForm && (
          <div style={{ background: '#f9fafb', padding: '25px', borderRadius: '15px', marginBottom: '30px', border: '2px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', color: '#374151' }}>Создать привычку</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Название</label>
              <input type="text" value={habitName} onChange={(e) => setHabitName(e.target.value)} placeholder="Зарядка" style={{ width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #d1d5db', borderRadius: '8px' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Время</label>
              <input type="time" value={habitTime} onChange={(e) => setHabitTime(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #d1d5db', borderRadius: '8px' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Дни недели</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '8px' }}>
                {Object.keys(habitDays).map(day => (
                  <button key={day} onClick={() => setHabitDays({...habitDays, [day]: !habitDays[day]})}
                    style={{ padding: '10px', fontSize: '14px', fontWeight: '600', background: habitDays[day] ? '#667eea' : 'white', color: habitDays[day] ? 'white' : '#6b7280', border: `2px solid ${habitDays[day] ? '#667eea' : '#d1d5db'}`, borderRadius: '8px', cursor: 'pointer' }}>
                    {getDayLabel(day)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={useTelegramUnlock} onChange={(e) => setUseTelegramUnlock(e.target.checked)} style={{ width: '20px', height: '20px', marginRight: '10px', cursor: 'pointer' }} />
                🔐 Разблокировка только через Telegram бота
              </label>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} style={{ width: '20px', height: '20px', marginRight: '10px', cursor: 'pointer' }} />
                🔊 Включить звук
              </label>
            </div>
            <button onClick={addHabit} style={{ width: '100%', padding: '15px', fontSize: '18px', fontWeight: 'bold', background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✓ Создать</button>
          </div>
        )}

        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: '#374151' }}>Мои привычки ({habits.length})</h2>
          {habits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📝</div>
              <p>Нет привычек. Создай первую!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {habits.map(habit => (
                <div key={habit.id} style={{ background: habit.completedToday ? '#ecfdf5' : 'white', border: `2px solid ${habit.completedToday ? '#10b981' : '#e5e7eb'}`, borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: 'bold' }}>{habit.name} {habit.completedToday && <span style={{ background: '#10b981', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>✓ Выполнено</span>}</h3>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '14px', color: '#6b7280', marginTop: '5px' }}>
                        <span>⏰ {habit.time}</span>
                        <span>📅 {Object.entries(habit.days).filter(([_,v])=>v).map(([d])=>getDayLabel(d)).join(', ')}</span>
                        {habit.useTelegramUnlock && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px' }}>🔐 TG unlock</span>}
                      </div>
                      {habit.lastCompleted && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>Последнее: {new Date(habit.lastCompleted).toLocaleString('ru-RU')}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => triggerHabit(habit)} style={{ padding: '8px 16px', fontSize: '14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🧪 Тест</button>
                      <button onClick={() => deleteHabit(habit.id)} style={{ padding: '8px 16px', fontSize: '14px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop: '30px', padding: '20px', background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '12px', fontSize: '14px', color: '#78350f' }}>
          <h4 style={{ fontWeight: 'bold' }}>💡 Информация</h4>
          <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
            <li>Тестовая кнопка запускает блокировку.</li>
            <li>Звук теперь громкий и повторяется каждые 2 секунды до разблокировки.</li>
            <li>Telegram: после /unlock привычка засчитывается автоматически.</li>
            <li>При блокировке включается полноэкранный режим и блокируется кнопка "Назад". Для полной блокировки телефона нужны доп. настройки (см. ниже).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}