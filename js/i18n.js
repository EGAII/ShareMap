// Translations. To add a language: copy the `en` block, translate it,
// and add it to LANGS below.
(() => {
'use strict';

const LANGS = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
  { code: 'zh-TW', label: '繁體中文', locale: 'zh-TW' },
  { code: 'zh-CN', label: '简体中文', locale: 'zh-CN' },
];

const DICT = {
  en: {
    appTitle: 'ShareMap',
    'nav.org': 'Members',
    'org.label': 'Organization', 'org.createJoin': 'Create or join…',
    'onb.title': 'Join or create an organization',
    'onb.joinTitle': 'Join with an invite code', 'onb.codePh': 'Invite code (e.g. 8K3ZZFFP)', 'onb.join': 'Join', 'onb.or': 'or',
    'onb.createTitle': 'Create a new organization', 'onb.namePh': 'Name (e.g. Tanaka Family, Tennis Club)', 'onb.create': 'Create',
    'onb.joined': 'Joined “{name}”.', 'onb.created': 'Created “{name}”. Share the invite code to add people.',
    'onb.pending': 'Join with invite code {code}?',
    'org.invite': 'Invite people',
    'org.copyCode': 'Copy code', 'org.copyLink': 'Copy invite link', 'org.newCode': 'Make new code',
    'org.newCodeConfirm': 'Make a new code? The old code and link will stop working.', 'org.copied': 'Copied',
    'org.members': 'Members ({n})', 'org.owner': 'Owner', 'org.leave': 'Leave this organization',
    'org.leaveConfirm': 'Leave “{name}”? You will lose access to its places and calendar.',
    'org.removeConfirm': 'Remove {name} from this organization?',
    'org.delete': 'Delete organization',
    'org.deleteConfirm': 'To delete “{name}” and ALL its places, categories and events, type its name:',
    'org.renamePrompt': 'Organization name', 'org.mine': 'My organizations', 'org.current': 'current',
    'nav.places': 'Places', 'nav.calendar': 'Calendar', 'nav.categories': 'Categories',
    signOut: 'Sign out', add: 'Add', edit: 'Edit', delete: 'Delete', cancel: 'Cancel', save: 'Save',
    saved: 'Saved', rename: 'Rename', remove: 'Remove', create: 'Create', back: 'Back', reload: 'Reload',
    language: 'Language',
    'auth.signIn': 'Sign in', 'auth.signUp': 'Create account', 'auth.email': 'Email',
    'auth.password': 'Password', 'auth.passwordNew': 'New password', 'auth.name': 'Your name (optional)',
    'auth.forgot': 'Forgot password?', 'auth.sendReset': 'Send reset link', 'auth.resetSent': 'Password reset email sent. Open the link in it to set a new password.',
    'auth.back': 'Back to sign in', 'auth.setNew': 'Set a new password', 'auth.pwSaved': 'Password updated',
    'auth.badLogin': 'Wrong email or password', 'auth.exists': 'This email already has an account. Sign in instead.', 'auth.weak': 'Please choose a stronger password',
    'auth.short': 'Use at least 8 characters', 'auth.notConfirmed': 'Confirm your email first, then sign in', 'auth.confirmSent': 'Account created. Open the link in the confirmation email, then sign in.',
    'auth.show': 'Show password', 'auth.hide': 'Hide password',
    'install.btn': 'Add to home screen', 'install.title': 'Add ShareMap to your home screen', 'install.now': 'Install',
    'install.ios': 'iPhone / iPad', 'install.android': 'Android', 'install.ios1': 'Open this page in Safari',
    'install.ios2': 'Tap the Share button', 'install.ios3': 'Choose “Add to Home Screen”', 'install.ios4': 'Tap “Add”',
    'install.and1': 'Open this page in Chrome', 'install.and2': 'Tap the menu at the top right', 'install.and3': 'Choose “Add to Home screen” or “Install app”',
    'install.and4': 'Tap “Install”', 'install.iosNote': 'The first time you open it from the icon, sign in once more.',
    emailPh: 'you@example.com',

    'setup.title': 'Setup needed',
    'setup.body': 'Edit <code>js/config.js</code> and fill in your Supabase URL and anon key. See README.md.',

    'places.search': 'Search places…', 'places.add': 'Add place', 'places.all': 'All places',
    'places.none': 'No category', 'places.empty': 'No places here.',
    'places.emptyTitle': 'Start your map', 'places.emptyAll': 'Open a place in Google Maps, tap Share, copy the link and paste it here.', skip: 'Skip to content',
    'places.direct': 'Other places in {name}', 'places.results': 'Search results',
    'cover.next': 'Next: {title}', 'cover.none': 'No plans yet',
    'places.open': 'Open in Google Maps', 'places.event': 'Event',
    'place.addTitle': 'Add place', 'place.editTitle': 'Edit place', 'place.link': 'Google Maps share link',
    'place.linkPh': 'Paste from Google Maps → Share → Copy link', 'place.name': 'Name', 'place.category': 'Category',
    'place.note': 'Note', 'place.notePh': 'Opening hours, parking, kid-friendly…', 'place.noCategory': '— No category —',
    'place.needUrl': 'Please paste a link that starts with https://',
    'place.notGoogle': 'This does not look like a Google Maps link. Save anyway?',
    'place.confirmDelete': 'Delete “{name}”? Events at this place will also be deleted.',

    'cal.today': 'Today', 'cal.new': 'New event', 'cal.upcoming': 'Upcoming (30 days)',
    'cal.more': '+{n} more', 'cal.noUpcoming': 'No upcoming events.', 'day.newHere': 'New event this day',

    'cats.title': 'Categories',
    'cats.newParentPh': 'New main category (e.g. Restaurants)', 'cats.none': 'No categories yet.',
    'cats.placesCount': '{n} places', 'cats.placesCount_one': '{n} place', 'cats.newChildPh': 'New sub-category under {name}',
    'cats.renamePrompt': 'New name',
    'cats.deleteChild': 'Delete “{name}”? Its places will become “No category”.',
    'cats.deleteParent': 'Delete “{name}” and all its sub-categories? Their places will become “No category”.',

    'fam.profile': 'My profile', 'fam.displayName': 'Display name',
    'fam.you': '(you)',

    'ev.new': 'New event', 'ev.place': 'Place', 'ev.selectPlace': '— Select a place —', 'ev.title': 'Title',
    'ev.date': 'Date', 'ev.start': 'Start', 'ev.end': 'End', 'ev.repeat': 'Repeat',
    'rep.none': 'Does not repeat', 'rep.weekly': 'Weekly', 'rep.daily': 'Daily', 'rep.monthly': 'Monthly (same day)',
    'ev.every': 'Every', 'ev.on': 'On', 'ev.until': 'Repeat until',
    'ev.limit': 'People limit', 'ev.limitPh': 'No limit',
    'ev.details': 'Details', 'ev.detailsPh': 'What to bring, meeting point…',
    'ev.joining': "I'm joining", 'ev.everyTime': '(every time)',
    'ev.needPlace': 'Add a place first.', 'ev.pickWeekday': 'Pick at least one weekday',
    'ev.untilBefore': '“Repeat until” is before the start date',
    'ev.sameTime': 'End time is the same as the start time',
    'ev.created': 'Event created', 'ev.createdRepeat': 'Repeating event created',

    'rt.none': 'Does not repeat', 'rt.daily1': 'Every day', 'rt.dailyN': 'Every {n} days',
    'rt.weekly1': 'Every week on {days}', 'rt.weeklyN': 'Every {n} weeks on {days}',
    'rt.monthly1': 'Every month on day {d}', 'rt.monthlyN': 'Every {n} months on day {d}',
    'rt.until': ' until {date}', 'rt.stopped': ' (stopped)', listSep: ', ',

    'badge.cancelled': 'Cancelled', 'badge.joined': 'Joined', 'badge.waitlist': 'Waitlist #{n}',
    'count.waiting': '{n} waiting',
    'ev.when': 'When', 'ev.where': 'Where', 'ev.repeatLbl': 'Repeat', 'ev.limitLbl': 'Limit',
    'ev.peopleN': '{n} people', 'ev.noLimit': 'No limit', 'ev.going': 'Going', 'ev.nobody': 'Nobody yet',
    'ev.waitlist': 'Waiting list', 'ev.leave': 'Leave', 'ev.leaveWait': 'Leave waiting list',
    'ev.join': 'Join', 'ev.joinWait': 'Join waiting list', 'ev.guest': 'Bring a guest',
    'ev.autoOn': 'Auto-joining every time', 'ev.autoOff': 'Auto-join every time',
    'ev.gcal': 'Add to Google Calendar', 'ev.organizer': 'Organizer',
    'ev.cancelDate': 'Cancel this date', 'ev.restoreDate': 'Restore this date',
    'ev.edit': 'Edit', 'ev.editSeries': 'Edit series', 'ev.delete': 'Delete', 'ev.deleteSeries': 'Delete whole series',
    'ev.joined': 'Joined', 'ev.addedWait': 'Added to the waiting list', 'ev.guestPrompt': 'Guest name',
    'ev.guestOf': '(guest of {name})',
    'ev.stopAutoConfirm': 'Stop auto-joining? You will also be removed from future dates of this series.',
    'ev.autoToast': 'You will be registered for every date automatically',
    'ev.deleteConfirm': 'Delete this event?',
    'ev.deleteSeriesConfirm': 'Delete this repeating event and ALL its dates?',

    'se.titleSeries': 'Edit series', 'se.titleEvent': 'Edit event',
    'se.untilLbl': 'Repeat until',
    'se.keep': 'Keep repeating',
    'se.stopConfirm': 'Stop this series? All future dates (and who joined them) will be removed.',
  },

  ja: {
    appTitle: 'ShareMap',
    'nav.org': 'メンバー',
    'org.label': 'グループ', 'org.createJoin': '作成・参加…',
    'onb.title': 'グループに参加または作成',
    'onb.joinTitle': '招待コードで参加', 'onb.codePh': '招待コード（例：8K3ZZFFP）', 'onb.join': '参加', 'onb.or': 'または',
    'onb.createTitle': '新しいグループを作成', 'onb.namePh': '名前（例：田中家、テニス部）', 'onb.create': '作成',
    'onb.joined': '「{name}」に参加しました。', 'onb.created': '「{name}」を作成しました。招待コードを共有してメンバーを招待しましょう。',
    'onb.pending': '招待コード {code} で参加しますか？',
    'org.invite': 'メンバーを招待',
    'org.copyCode': 'コードをコピー', 'org.copyLink': '招待リンクをコピー', 'org.newCode': 'コードを再発行',
    'org.newCodeConfirm': 'コードを再発行しますか？古いコードとリンクは使えなくなります。', 'org.copied': 'コピーしました',
    'org.members': 'メンバー（{n}人）', 'org.owner': 'オーナー', 'org.leave': 'このグループから退出',
    'org.leaveConfirm': '「{name}」から退出しますか？スポットとカレンダーが見られなくなります。',
    'org.removeConfirm': '{name} をこのグループから外しますか？',
    'org.delete': 'グループを削除',
    'org.deleteConfirm': '「{name}」とそのスポット・カテゴリ・イベントをすべて削除します。確認のためグループ名を入力してください：',
    'org.renamePrompt': 'グループ名', 'org.mine': '参加中のグループ', 'org.current': '表示中',
    'nav.places': 'スポット', 'nav.calendar': 'カレンダー', 'nav.categories': 'カテゴリ',
    signOut: 'ログアウト', add: '追加', edit: '編集', delete: '削除', cancel: 'キャンセル', save: '保存',
    saved: '保存しました', rename: '名前変更', remove: '削除', create: '作成', back: '戻る', reload: '再読み込み',
    language: '言語',
    'auth.signIn': 'ログイン', 'auth.signUp': 'アカウント作成', 'auth.email': 'メールアドレス',
    'auth.password': 'パスワード', 'auth.passwordNew': '新しいパスワード', 'auth.name': 'お名前（任意）',
    'auth.forgot': 'パスワードをお忘れですか？', 'auth.sendReset': '再設定リンクを送信', 'auth.resetSent': 'パスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。',
    'auth.back': 'ログインに戻る', 'auth.setNew': '新しいパスワードを設定', 'auth.pwSaved': 'パスワードを変更しました',
    'auth.badLogin': 'メールアドレスまたはパスワードが違います', 'auth.exists': 'このメールアドレスは登録済みです。ログインしてください。', 'auth.weak': 'もっと強いパスワードにしてください',
    'auth.short': '8文字以上で入力してください', 'auth.notConfirmed': 'メールアドレスの確認後にログインしてください', 'auth.confirmSent': 'アカウントを作成しました。確認メールのリンクを開いてから、ログインしてください。',
    'auth.show': 'パスワードを表示', 'auth.hide': 'パスワードを隠す',
    'install.btn': 'ホーム画面に追加', 'install.title': 'ShareMap をホーム画面に追加', 'install.now': 'インストール',
    'install.ios': 'iPhone / iPad', 'install.android': 'Android', 'install.ios1': 'Safari でこのページを開く',
    'install.ios2': '共有ボタンをタップ', 'install.ios3': '「ホーム画面に追加」を選ぶ', 'install.ios4': '「追加」をタップ',
    'install.and1': 'Chrome でこのページを開く', 'install.and2': '右上のメニューをタップ', 'install.and3': '「ホーム画面に追加」または「アプリをインストール」を選ぶ',
    'install.and4': '「インストール」をタップ', 'install.iosNote': 'アイコンから初めて開いたときは、もう一度ログインしてください。',
    emailPh: 'you@example.com',

    'setup.title': '初期設定が必要です',
    'setup.body': '<code>js/config.js</code> に Supabase の URL と anon key を設定してください。詳しくは README.md を参照。',

    'places.search': 'スポットを検索…', 'places.add': 'スポット追加', 'places.all': 'すべて',
    'places.none': '未分類', 'places.empty': 'ここにはスポットがありません。',
    'places.emptyTitle': 'マップを始めましょう', 'places.emptyAll': 'Google マップで場所を開き「共有」からリンクをコピーして、ここに貼り付けます。', skip: 'メインコンテンツへ移動',
    'places.direct': '「{name}」のその他のスポット', 'places.results': '検索結果',
    'cover.next': '次回：{title}', 'cover.none': '予定なし',
    'places.open': 'Google マップで開く', 'places.event': 'イベント',
    'place.addTitle': 'スポット追加', 'place.editTitle': 'スポット編集', 'place.link': 'Google マップ共有リンク',
    'place.linkPh': 'Google マップ → 共有 → リンクをコピー して貼り付け', 'place.name': '名前', 'place.category': 'カテゴリ',
    'place.note': 'メモ', 'place.notePh': '営業時間、駐車場、子連れOK など…', 'place.noCategory': '— 未分類 —',
    'place.needUrl': 'https:// で始まるリンクを貼り付けてください',
    'place.notGoogle': 'Google マップのリンクではないようです。このまま保存しますか？',
    'place.confirmDelete': '「{name}」を削除しますか？このスポットのイベントも削除されます。',

    'cal.today': '今日', 'cal.new': '新規イベント', 'cal.upcoming': '今後の予定（30日間）',
    'cal.more': '他 {n} 件', 'cal.noUpcoming': '今後の予定はありません。', 'day.newHere': 'この日にイベント作成',

    'cats.title': 'カテゴリ',
    'cats.newParentPh': '新しい大カテゴリ（例：レストラン）', 'cats.none': 'カテゴリはまだありません。',
    'cats.placesCount': '{n} 件', 'cats.newChildPh': '「{name}」の小カテゴリを追加',
    'cats.renamePrompt': '新しい名前',
    'cats.deleteChild': '「{name}」を削除しますか？スポットは「未分類」になります。',
    'cats.deleteParent': '「{name}」とその小カテゴリをすべて削除しますか？スポットは「未分類」になります。',

    'fam.profile': 'プロフィール', 'fam.displayName': '表示名',
    'fam.you': '（あなた）',

    'ev.new': '新規イベント', 'ev.place': 'スポット', 'ev.selectPlace': '— スポットを選択 —', 'ev.title': 'タイトル',
    'ev.date': '日付', 'ev.start': '開始', 'ev.end': '終了', 'ev.repeat': '繰り返し',
    'rep.none': '繰り返さない', 'rep.weekly': '毎週', 'rep.daily': '毎日', 'rep.monthly': '毎月（同じ日）',
    'ev.every': '間隔', 'ev.on': '曜日', 'ev.until': '終了日',
    'ev.limit': '定員', 'ev.limitPh': '無制限',
    'ev.details': '詳細', 'ev.detailsPh': '持ち物、集合場所など…',
    'ev.joining': '自分も参加する', 'ev.everyTime': '（毎回）',
    'ev.needPlace': '先にスポットを追加してください。', 'ev.pickWeekday': '曜日を1つ以上選んでください',
    'ev.untilBefore': '終了日が開始日より前です',
    'ev.sameTime': '終了時刻が開始時刻と同じです',
    'ev.created': 'イベントを作成しました', 'ev.createdRepeat': '繰り返しイベントを作成しました',

    'rt.none': '繰り返しなし', 'rt.daily1': '毎日', 'rt.dailyN': '{n}日ごと',
    'rt.weekly1': '毎週 {days}', 'rt.weeklyN': '{n}週ごと {days}',
    'rt.monthly1': '毎月 {d}日', 'rt.monthlyN': '{n}か月ごと {d}日',
    'rt.until': '（{date} まで）', 'rt.stopped': '（停止中）', listSep: '・',

    'badge.cancelled': '中止', 'badge.joined': '参加', 'badge.waitlist': 'キャンセル待ち {n}番',
    'count.waiting': '待ち {n}人',
    'ev.when': '日時', 'ev.where': '場所', 'ev.repeatLbl': '繰り返し', 'ev.limitLbl': '定員',
    'ev.peopleN': '{n}人', 'ev.noLimit': '無制限', 'ev.going': '参加者', 'ev.nobody': 'まだいません',
    'ev.waitlist': 'キャンセル待ち', 'ev.leave': '参加を取り消す', 'ev.leaveWait': 'キャンセル待ちを取り消す',
    'ev.join': '参加する', 'ev.joinWait': 'キャンセル待ちに登録', 'ev.guest': 'ゲストを追加',
    'ev.autoOn': '毎回自動参加中', 'ev.autoOff': '毎回自動参加する',
    'ev.gcal': 'Google カレンダーに追加', 'ev.organizer': '主催者メニュー',
    'ev.cancelDate': 'この日を中止', 'ev.restoreDate': 'この日を再開',
    'ev.edit': '編集', 'ev.editSeries': 'シリーズを編集', 'ev.delete': '削除', 'ev.deleteSeries': 'シリーズごと削除',
    'ev.joined': '参加しました', 'ev.addedWait': 'キャンセル待ちに登録しました', 'ev.guestPrompt': 'ゲストの名前',
    'ev.guestOf': '（{name} のゲスト）',
    'ev.stopAutoConfirm': '自動参加をやめますか？このシリーズの今後の日程からも外れます。',
    'ev.autoToast': '今後すべての日程に自動で登録されます',
    'ev.deleteConfirm': 'このイベントを削除しますか？',
    'ev.deleteSeriesConfirm': 'この繰り返しイベントと全日程を削除しますか？',

    'se.titleSeries': 'シリーズを編集', 'se.titleEvent': 'イベントを編集',
    'se.untilLbl': '終了日',
    'se.keep': '繰り返しを続ける',
    'se.stopConfirm': 'このシリーズを停止しますか？今後の日程（と参加者）はすべて削除されます。',
  },

  'zh-TW': {
    appTitle: 'ShareMap',
    'nav.org': '成員',
    'org.label': '群組', 'org.createJoin': '建立或加入…',
    'onb.title': '加入或建立群組',
    'onb.joinTitle': '用邀請碼加入', 'onb.codePh': '邀請碼（例如 8K3ZZFFP）', 'onb.join': '加入', 'onb.or': '或',
    'onb.createTitle': '建立新群組', 'onb.namePh': '名稱（例如：田中家、網球社）', 'onb.create': '建立',
    'onb.joined': '已加入「{name}」。', 'onb.created': '已建立「{name}」，分享邀請碼來邀請大家吧。',
    'onb.pending': '要用邀請碼 {code} 加入嗎？',
    'org.invite': '邀請成員',
    'org.copyCode': '複製邀請碼', 'org.copyLink': '複製邀請連結', 'org.newCode': '重新產生邀請碼',
    'org.newCodeConfirm': '要重新產生邀請碼嗎？舊的邀請碼和連結將失效。', 'org.copied': '已複製',
    'org.members': '成員（{n} 人）', 'org.owner': '管理者', 'org.leave': '退出此群組',
    'org.leaveConfirm': '要退出「{name}」嗎？你將無法再看到它的地點和行事曆。',
    'org.removeConfirm': '要將 {name} 從此群組移除嗎？',
    'org.delete': '刪除群組',
    'org.deleteConfirm': '將刪除「{name}」及其所有地點、分類和活動。請輸入群組名稱以確認：',
    'org.renamePrompt': '群組名稱', 'org.mine': '我的群組', 'org.current': '目前',
    'nav.places': '地點', 'nav.calendar': '行事曆', 'nav.categories': '分類',
    signOut: '登出', add: '新增', edit: '編輯', delete: '刪除', cancel: '取消', save: '儲存',
    saved: '已儲存', rename: '重新命名', remove: '移除', create: '建立', back: '返回', reload: '重新整理',
    language: '語言',
    'auth.signIn': '登入', 'auth.signUp': '建立帳號', 'auth.email': '電子郵件',
    'auth.password': '密碼', 'auth.passwordNew': '新密碼', 'auth.name': '你的名字（選填）',
    'auth.forgot': '忘記密碼？', 'auth.sendReset': '寄送重設連結', 'auth.resetSent': '已寄出密碼重設郵件，請點擊信中的連結設定新密碼。',
    'auth.back': '返回登入', 'auth.setNew': '設定新密碼', 'auth.pwSaved': '密碼已更新',
    'auth.badLogin': '電子郵件或密碼錯誤', 'auth.exists': '此電子郵件已註冊，請直接登入。', 'auth.weak': '請使用更安全的密碼',
    'auth.short': '請至少輸入 8 個字元', 'auth.notConfirmed': '請先確認電子郵件，再登入', 'auth.confirmSent': '帳號已建立。請先點擊確認郵件中的連結，再登入。',
    'auth.show': '顯示密碼', 'auth.hide': '隱藏密碼',
    'install.btn': '加到主畫面', 'install.title': '把 ShareMap 加到主畫面', 'install.now': '安裝',
    'install.ios': 'iPhone / iPad', 'install.android': 'Android', 'install.ios1': '用 Safari 開啟此頁面',
    'install.ios2': '點「分享」按鈕', 'install.ios3': '選擇「加入主畫面」', 'install.ios4': '點「加入」',
    'install.and1': '用 Chrome 開啟此頁面', 'install.and2': '點右上角的選單', 'install.and3': '選擇「加到主畫面」或「安裝應用程式」',
    'install.and4': '點「安裝」', 'install.iosNote': '第一次從圖示開啟時，請再登入一次。',
    emailPh: 'you@example.com',

    'setup.title': '需要設定',
    'setup.body': '請編輯 <code>js/config.js</code>，填入 Supabase URL 與 anon key。詳見 README.md。',

    'places.search': '搜尋地點…', 'places.add': '新增地點', 'places.all': '全部地點',
    'places.none': '未分類', 'places.empty': '這裡沒有地點。',
    'places.emptyTitle': '開始建立地圖', 'places.emptyAll': '在 Google 地圖打開地點，點「分享」複製連結，然後貼到這裡。', skip: '跳到主要內容',
    'places.direct': '「{name}」的其他地點', 'places.results': '搜尋結果',
    'cover.next': '下次：{title}', 'cover.none': '尚無計畫',
    'places.open': '在 Google 地圖開啟', 'places.event': '活動',
    'place.addTitle': '新增地點', 'place.editTitle': '編輯地點', 'place.link': 'Google 地圖分享連結',
    'place.linkPh': '從 Google 地圖 → 分享 → 複製連結 後貼上', 'place.name': '名稱', 'place.category': '分類',
    'place.note': '備註', 'place.notePh': '營業時間、停車、適合帶小孩…', 'place.noCategory': '— 未分類 —',
    'place.needUrl': '請貼上以 https:// 開頭的連結',
    'place.notGoogle': '這看起來不像 Google 地圖連結，仍要儲存嗎？',
    'place.confirmDelete': '要刪除「{name}」嗎？此地點的活動也會一併刪除。',

    'cal.today': '今天', 'cal.new': '新增活動', 'cal.upcoming': '近期活動（30 天內）',
    'cal.more': '還有 {n} 個', 'cal.noUpcoming': '近期沒有活動。', 'day.newHere': '在這天新增活動',

    'cats.title': '分類',
    'cats.newParentPh': '新的主分類（例如：餐廳）', 'cats.none': '還沒有分類。',
    'cats.placesCount': '{n} 個地點', 'cats.newChildPh': '在「{name}」下新增子分類',
    'cats.renamePrompt': '新名稱',
    'cats.deleteChild': '要刪除「{name}」嗎？其中的地點會變成「未分類」。',
    'cats.deleteParent': '要刪除「{name}」及其所有子分類嗎？其中的地點會變成「未分類」。',

    'fam.profile': '我的資料', 'fam.displayName': '顯示名稱',
    'fam.you': '（你）',

    'ev.new': '新增活動', 'ev.place': '地點', 'ev.selectPlace': '— 選擇地點 —', 'ev.title': '標題',
    'ev.date': '日期', 'ev.start': '開始', 'ev.end': '結束', 'ev.repeat': '重複',
    'rep.none': '不重複', 'rep.weekly': '每週', 'rep.daily': '每天', 'rep.monthly': '每月（同一天）',
    'ev.every': '間隔', 'ev.on': '星期', 'ev.until': '重複至',
    'ev.limit': '人數上限', 'ev.limitPh': '不限',
    'ev.details': '詳細說明', 'ev.detailsPh': '要帶什麼、集合地點…',
    'ev.joining': '我要參加', 'ev.everyTime': '（每次）',
    'ev.needPlace': '請先新增地點。', 'ev.pickWeekday': '請至少選擇一個星期',
    'ev.untilBefore': '「重複至」早於開始日期',
    'ev.sameTime': '結束時間與開始時間相同',
    'ev.created': '已建立活動', 'ev.createdRepeat': '已建立重複活動',

    'rt.none': '不重複', 'rt.daily1': '每天', 'rt.dailyN': '每 {n} 天',
    'rt.weekly1': '每週 {days}', 'rt.weeklyN': '每 {n} 週 {days}',
    'rt.monthly1': '每月 {d} 日', 'rt.monthlyN': '每 {n} 個月 {d} 日',
    'rt.until': '（至 {date}）', 'rt.stopped': '（已停止）', listSep: '、',

    'badge.cancelled': '已取消', 'badge.joined': '已參加', 'badge.waitlist': '候補第 {n} 位',
    'count.waiting': '候補 {n} 人',
    'ev.when': '時間', 'ev.where': '地點', 'ev.repeatLbl': '重複', 'ev.limitLbl': '人數上限',
    'ev.peopleN': '{n} 人', 'ev.noLimit': '不限', 'ev.going': '參加者', 'ev.nobody': '還沒有人',
    'ev.waitlist': '候補名單', 'ev.leave': '取消參加', 'ev.leaveWait': '取消候補',
    'ev.join': '參加', 'ev.joinWait': '加入候補', 'ev.guest': '帶朋友',
    'ev.autoOn': '每次自動參加中', 'ev.autoOff': '每次自動參加',
    'ev.gcal': '加到 Google 日曆', 'ev.organizer': '主辦人',
    'ev.cancelDate': '取消這一天', 'ev.restoreDate': '恢復這一天',
    'ev.edit': '編輯', 'ev.editSeries': '編輯系列', 'ev.delete': '刪除', 'ev.deleteSeries': '刪除整個系列',
    'ev.joined': '已參加', 'ev.addedWait': '已加入候補名單', 'ev.guestPrompt': '朋友的名字',
    'ev.guestOf': '（{name} 的朋友）',
    'ev.stopAutoConfirm': '要停止自動參加嗎？你也會從此系列之後的日期中移除。',
    'ev.autoToast': '之後的每個日期都會自動幫你報名',
    'ev.deleteConfirm': '要刪除這個活動嗎？',
    'ev.deleteSeriesConfirm': '要刪除這個重複活動及其所有日期嗎？',

    'se.titleSeries': '編輯系列', 'se.titleEvent': '編輯活動',
    'se.untilLbl': '重複至',
    'se.keep': '持續重複',
    'se.stopConfirm': '要停止這個系列嗎？之後所有日期（及報名者）都會被刪除。',
  },

  'zh-CN': {
    appTitle: 'ShareMap',
    'nav.org': '成员',
    'org.label': '群组', 'org.createJoin': '创建或加入…',
    'onb.title': '加入或创建群组',
    'onb.joinTitle': '用邀请码加入', 'onb.codePh': '邀请码（例如 8K3ZZFFP）', 'onb.join': '加入', 'onb.or': '或',
    'onb.createTitle': '创建新群组', 'onb.namePh': '名称（例如：田中家、网球俱乐部）', 'onb.create': '创建',
    'onb.joined': '已加入“{name}”。', 'onb.created': '已创建“{name}”，分享邀请码邀请大家加入吧。',
    'onb.pending': '要用邀请码 {code} 加入吗？',
    'org.invite': '邀请成员',
    'org.copyCode': '复制邀请码', 'org.copyLink': '复制邀请链接', 'org.newCode': '重新生成邀请码',
    'org.newCodeConfirm': '要重新生成邀请码吗？旧的邀请码和链接将失效。', 'org.copied': '已复制',
    'org.members': '成员（{n} 人）', 'org.owner': '管理员', 'org.leave': '退出该群组',
    'org.leaveConfirm': '要退出“{name}”吗？你将无法再查看它的地点和日历。',
    'org.removeConfirm': '要将 {name} 移出该群组吗？',
    'org.delete': '删除群组',
    'org.deleteConfirm': '将删除“{name}”及其所有地点、分类和活动。请输入群组名称以确认：',
    'org.renamePrompt': '群组名称', 'org.mine': '我的群组', 'org.current': '当前',
    'nav.places': '地点', 'nav.calendar': '日历', 'nav.categories': '分类',
    signOut: '退出登录', add: '添加', edit: '编辑', delete: '删除', cancel: '取消', save: '保存',
    saved: '已保存', rename: '重命名', remove: '移除', create: '创建', back: '返回', reload: '刷新',
    language: '语言',
    'auth.signIn': '登录', 'auth.signUp': '创建账号', 'auth.email': '邮箱',
    'auth.password': '密码', 'auth.passwordNew': '新密码', 'auth.name': '你的名字（选填）',
    'auth.forgot': '忘记密码？', 'auth.sendReset': '发送重置链接', 'auth.resetSent': '已发送密码重置邮件，请点击邮件中的链接设置新密码。',
    'auth.back': '返回登录', 'auth.setNew': '设置新密码', 'auth.pwSaved': '密码已更新',
    'auth.badLogin': '邮箱或密码错误', 'auth.exists': '该邮箱已注册，请直接登录。', 'auth.weak': '请使用更安全的密码',
    'auth.short': '请至少输入 8 个字符', 'auth.notConfirmed': '请先确认邮箱，再登录', 'auth.confirmSent': '账号已创建。请先点击确认邮件中的链接，再登录。',
    'auth.show': '显示密码', 'auth.hide': '隐藏密码',
    'install.btn': '添加到主屏幕', 'install.title': '把 ShareMap 添加到主屏幕', 'install.now': '安装',
    'install.ios': 'iPhone / iPad', 'install.android': 'Android', 'install.ios1': '用 Safari 打开此页面',
    'install.ios2': '点击“分享”按钮', 'install.ios3': '选择“添加到主屏幕”', 'install.ios4': '点击“添加”',
    'install.and1': '用 Chrome 打开此页面', 'install.and2': '点击右上角的菜单', 'install.and3': '选择“添加到主屏幕”或“安装应用”',
    'install.and4': '点击“安装”', 'install.iosNote': '第一次从图标打开时，请再登录一次。',
    emailPh: 'you@example.com',

    'setup.title': '需要设置',
    'setup.body': '请编辑 <code>js/config.js</code>，填入 Supabase URL 和 anon key。详见 README.md。',

    'places.search': '搜索地点…', 'places.add': '添加地点', 'places.all': '全部地点',
    'places.none': '未分类', 'places.empty': '这里没有地点。',
    'places.emptyTitle': '开始建立地图', 'places.emptyAll': '在 Google 地图中打开地点，点击“分享”复制链接，然后粘贴到这里。', skip: '跳到主要内容',
    'places.direct': '“{name}”的其他地点', 'places.results': '搜索结果',
    'cover.next': '下次：{title}', 'cover.none': '暂无计划',
    'places.open': '在 Google 地图中打开', 'places.event': '活动',
    'place.addTitle': '添加地点', 'place.editTitle': '编辑地点', 'place.link': 'Google 地图分享链接',
    'place.linkPh': '在 Google 地图中点“分享 → 复制链接”，然后粘贴', 'place.name': '名称', 'place.category': '分类',
    'place.note': '备注', 'place.notePh': '营业时间、停车、适合带孩子…', 'place.noCategory': '— 未分类 —',
    'place.needUrl': '请粘贴以 https:// 开头的链接',
    'place.notGoogle': '这看起来不像 Google 地图链接，仍要保存吗？',
    'place.confirmDelete': '要删除“{name}”吗？该地点的活动也会一并删除。',

    'cal.today': '今天', 'cal.new': '新建活动', 'cal.upcoming': '近期活动（30 天内）',
    'cal.more': '还有 {n} 个', 'cal.noUpcoming': '近期没有活动。', 'day.newHere': '在这天新建活动',

    'cats.title': '分类',
    'cats.newParentPh': '新的一级分类（例如：餐厅）', 'cats.none': '还没有分类。',
    'cats.placesCount': '{n} 个地点', 'cats.newChildPh': '在“{name}”下添加二级分类',
    'cats.renamePrompt': '新名称',
    'cats.deleteChild': '要删除“{name}”吗？其中的地点将变为“未分类”。',
    'cats.deleteParent': '要删除“{name}”及其所有二级分类吗？其中的地点将变为“未分类”。',

    'fam.profile': '我的资料', 'fam.displayName': '显示名称',
    'fam.you': '（你）',

    'ev.new': '新建活动', 'ev.place': '地点', 'ev.selectPlace': '— 选择地点 —', 'ev.title': '标题',
    'ev.date': '日期', 'ev.start': '开始', 'ev.end': '结束', 'ev.repeat': '重复',
    'rep.none': '不重复', 'rep.weekly': '每周', 'rep.daily': '每天', 'rep.monthly': '每月（同一天）',
    'ev.every': '间隔', 'ev.on': '星期', 'ev.until': '重复至',
    'ev.limit': '人数上限', 'ev.limitPh': '不限',
    'ev.details': '详细说明', 'ev.detailsPh': '要带什么、集合地点…',
    'ev.joining': '我要参加', 'ev.everyTime': '（每次）',
    'ev.needPlace': '请先添加地点。', 'ev.pickWeekday': '请至少选择一个星期',
    'ev.untilBefore': '“重复至”早于开始日期',
    'ev.sameTime': '结束时间与开始时间相同',
    'ev.created': '活动已创建', 'ev.createdRepeat': '重复活动已创建',

    'rt.none': '不重复', 'rt.daily1': '每天', 'rt.dailyN': '每 {n} 天',
    'rt.weekly1': '每周 {days}', 'rt.weeklyN': '每 {n} 周 {days}',
    'rt.monthly1': '每月 {d} 日', 'rt.monthlyN': '每 {n} 个月 {d} 日',
    'rt.until': '（至 {date}）', 'rt.stopped': '（已停止）', listSep: '、',

    'badge.cancelled': '已取消', 'badge.joined': '已报名', 'badge.waitlist': '候补第 {n} 位',
    'count.waiting': '候补 {n} 人',
    'ev.when': '时间', 'ev.where': '地点', 'ev.repeatLbl': '重复', 'ev.limitLbl': '人数上限',
    'ev.peopleN': '{n} 人', 'ev.noLimit': '不限', 'ev.going': '参加者', 'ev.nobody': '还没有人',
    'ev.waitlist': '候补名单', 'ev.leave': '取消报名', 'ev.leaveWait': '取消候补',
    'ev.join': '报名', 'ev.joinWait': '加入候补', 'ev.guest': '带朋友',
    'ev.autoOn': '每次自动报名中', 'ev.autoOff': '每次自动报名',
    'ev.gcal': '添加到 Google 日历', 'ev.organizer': '发起人',
    'ev.cancelDate': '取消这一天', 'ev.restoreDate': '恢复这一天',
    'ev.edit': '编辑', 'ev.editSeries': '编辑系列', 'ev.delete': '删除', 'ev.deleteSeries': '删除整个系列',
    'ev.joined': '报名成功', 'ev.addedWait': '已加入候补名单', 'ev.guestPrompt': '朋友的名字',
    'ev.guestOf': '（{name} 的朋友）',
    'ev.stopAutoConfirm': '要停止自动报名吗？你也会被移出该系列之后的日期。',
    'ev.autoToast': '之后的每个日期都会自动为你报名',
    'ev.deleteConfirm': '要删除这个活动吗？',
    'ev.deleteSeriesConfirm': '要删除这个重复活动及其所有日期吗？',

    'se.titleSeries': '编辑系列', 'se.titleEvent': '编辑活动',
    'se.untilLbl': '重复至',
    'se.keep': '继续重复',
    'se.stopConfirm': '要停止这个系列吗？之后所有日期（及报名者）都将被删除。',
  },
};

function detect() {
  try {
    const saved = localStorage.getItem('fsm.lang');
    if (saved && DICT[saved]) return saved;
  } catch { /* storage blocked */ }
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (/^zh-(cn|sg|hans)/.test(nav)) return 'zh-CN';
  if (nav.startsWith('zh')) return 'zh-TW';
  return 'en';
}

let lang = detect();

const i18n = {
  LANGS,
  get lang() { return lang; },
  get locale() { return LANGS.find((l) => l.code === lang).locale; },
  t(key, vars = {}) {
    // Optional singular form: 'key_one' is used when n === 1 (only English needs it)
    const one = vars.n === 1 ? DICT[lang][key + '_one'] : undefined;
    const s = one ?? DICT[lang][key] ?? DICT.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  },
  set(code) {
    if (!DICT[code]) return;
    lang = code;
    try { localStorage.setItem('fsm.lang', code); } catch { /* ignore */ }
    i18n.apply();
  },
  // Static text in index.html: data-i18n (text), data-i18n-html, data-i18n-ph (placeholder)
  apply(root = document) {
    document.documentElement.lang = i18n.locale;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = i18n.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = i18n.t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = i18n.t(el.dataset.i18nTitle);
      el.setAttribute('aria-label', el.title);
    });
    root.querySelectorAll('select.lang-select').forEach((sel) => {
      if (!sel.options.length) {
        sel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
      }
      sel.value = lang;
      sel.title = i18n.t('language');
    });
  },
};

window.i18n = i18n;
})();
