# Налаштування дашборда (один раз)

Потрібно три речі: база Neon, застосунок у Microsoft Entra і змінні у Vercel.
Усе робиться в браузері, займає близько 15 хвилин. Секрети вводиш тільки у Vercel, у чат їх не кидаєш.

---

## Крок 1. Дізнайся адресу сайту

1. Відкрий [vercel.com](https://vercel.com) → проєкт **fb-ads-dashboard**.
2. На сторінці **Overview** справа є блок **Domains**. Скопіюй адресу, наприклад `fb-ads-dashboard-abc.vercel.app`.

Далі в інструкції вона позначена як `АДРЕСА`.

---

## Крок 2. База Neon (у Vercel)

1. У проєкті відкрий вкладку **Storage** (верхнє меню).
2. Натисни **Create Database** → обери **Neon** (Serverless Postgres) → **Continue**.
3. **Region**: `Washington, D.C., USA (East) – iad1`. **Plan**: `Free`. Назва будь-яка, наприклад `fb-ads`. Натисни **Continue**, потім **Create**.
4. У вікні **Connect Project** залиш галочки на **Development, Preview, Production** і натисни **Connect**.

Готово. Vercel сам додав змінну `DATABASE_URL`, копіювати нічого не треба.

---

## Крок 3. Застосунок у Microsoft Entra

Відкрий [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → твій новий застосунок.

> Можна піти коротшим шляхом: використати той самий застосунок, що й для GBP-дашборда («FREITTY dashboard»).
> Тоді в ньому треба зробити тільки пункт 3.1, а в кроці 4 вставити ті самі ID, що вже стоять у GBP-проєкті у Vercel.

### 3.1. Адреса повернення
1. Зліва **Authentication** (у новому інтерфейсі **Authentication (Preview)** → вкладка **Settings**).
2. **Add a platform** → **Web**.
3. **Redirect URI**: `https://АДРЕСА/api/auth/callback`
   (приклад: `https://fb-ads-dashboard-abc.vercel.app/api/auth/callback`)
4. Нижче постав галочку **ID tokens (used for implicit and hybrid flows)**.
5. Натисни **Configure** / **Save**.

Client secret **не потрібен**, нічого в «Certificates & secrets» створювати не треба.

### 3.2. Скопіюй два ID
Зліва **Overview**. Там:
- **Application (client) ID** → знадобиться як `AUTH_CLIENT_ID`;
- **Directory (tenant) ID** → знадобиться як `AUTH_TENANT_ID`.

### 3.3. Хто може заходити
1. **Microsoft Entra ID** → **Enterprise applications** → знайди свій застосунок за назвою.
2. **Properties** → **Assignment required?** = **Yes** → **Save**.
3. **Users and groups** → **Add user/group** → обери людей → **Assign**.

Хто не доданий, побачить «Доступ до дашборда не надано».

---

## Крок 4. Змінні у Vercel

### 4.1. Згенеруй два випадкові рядки
У PowerShell на своєму компʼютері запусти **двічі**:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Перший результат піде в `SESSION_SECRET`, другий у `CRON_SECRET`.

### 4.2. Додай змінні
Vercel → проєкт → **Settings** → **Environment Variables**. Для кожного рядка: **Key**, **Value**, середовища **Production + Preview + Development**, потім **Save**.

| Key | Value |
|---|---|
| `AUTH_TENANT_ID` | Directory (tenant) ID з кроку 3.2 |
| `AUTH_CLIENT_ID` | Application (client) ID з кроку 3.2 |
| `SESSION_SECRET` | перший рядок з 4.1 |
| `CRON_SECRET` | другий рядок з 4.1 |
| `META_ACCESS_TOKEN` | токен Meta: відкрий файл `C:\FREITTY\fb-ads\.env` і скопіюй усе після `META_ACCESS_TOKEN=` |

`DATABASE_URL` вже доданий на кроці 2.

### 4.3. Перезапусти
**Deployments** → у верхньому рядку три крапки **⋯** → **Redeploy** → **Redeploy**.

---

## Крок 5. Перший вхід і завантаження історії

1. Відкрий `https://АДРЕСА` → **Увійти через Microsoft** → обери робочий акаунт.
2. Угорі буде блок **«Історія даних»** → натисни **«Завантажити всю історію»**.
3. Зачекай кілька хвилин, не закриваючи сторінку. Дашборд завантажує місяць за місяцем з серпня 2024 року.
4. Коли смужка дійде до кінця, блок зникне, і дашборд покаже всі дані.

Далі нічого робити не треба: нові дні Vercel додає сам щоранку (о 09:00 UTC).

---

## Якщо щось не так

| Що бачиш | Що робити |
|---|---|
| «Вхід ще не налаштовано» і список змінних | Цих змінних немає у Vercel. Додай (крок 4.2) і зроби Redeploy. |
| Microsoft пише про `redirect_uri` / AADSTS50011 | Redirect URI в Entra не збігається з адресою сайту. Перевір крок 3.1. |
| Microsoft пише про `response_type 'id_token' is not enabled` / AADSTS700054 | Не стоїть галочка **ID tokens** (крок 3.1, пункт 4). |
| «Доступ до дашборда не надано» | Людину не додано в **Users and groups** (крок 3.3). |
| Завантаження історії зупинилось з помилкою | Натисни кнопку ще раз, вона продовжить з того місяця, де зупинилась. |
