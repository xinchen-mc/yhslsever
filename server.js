const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// 修改为你的实际路径
const BASE_PATH = __dirname;
const PUBLIC_PATH = path.join(BASE_PATH, 'public');
const DATA_FILE = path.join(BASE_PATH, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_PATH));

// ============ QQ邮箱配置 ============
const EMAIL_CONFIG = {
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
        user: '3632372460@qq.com',
        pass: 'btbrceardlvychbh'  // 替换成真实授权码
    }
};

let transporter = null;

function initTransporter() {
    try {
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
        console.log('✓ 邮件服务已初始化');
    } catch (error) {
        console.error('✗ 邮件服务初始化失败:', error);
    }
}

async function sendEmail(to, subject, text) {
    if (!transporter) {
        console.log(`[模拟] 发送邮件到 ${to}: ${text}`);
        return { success: true };
    }
    try {
        await transporter.sendMail({
            from: `"永恒森林Wiki" <${EMAIL_CONFIG.auth.user}>`,
            to: to,
            subject: subject,
            text: text
        });
        console.log('✓ 邮件发送成功:', to);
        return { success: true };
    } catch (error) {
        console.error('✗ 邮件发送失败:', error.message);
        return { success: false, error: error.message };
    }
}

// 数据初始化
function initData() {
    if (!fs.existsSync(BASE_PATH)) {
        fs.mkdirSync(BASE_PATH, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        const defaultData = {
            announcements: [
                { id: 1, title: '📢 服务器开服公告', content: '欢迎来到永恒森林！请先注册账号并申请白名单。', type: 'info', date: new Date().toISOString() },
                { id: 2, title: '⚠️ 重要规则', content: '禁止使用外挂、飞行、透视等违规行为。一经发现永久封禁！', type: 'warning', date: new Date().toISOString() },
                { id: 3, title: '🖥️ 服务器地址', content: '主地址：pm.rainplay.cn:54160<br>备用地址：pmt.rainplay.cn:54160', type: 'server', date: new Date().toISOString() },
                { id: 4, title: '👥 QQ群', content: 'QQ群号：1056204573<br>欢迎加入交流！', type: 'community', date: new Date().toISOString() }
            ],
            users: [],
            whitelist: [],      // 白名单列表（游戏ID）
            whitelistRequests: [], // 白名单申请记录
            verificationCodes: {}
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }
}

function readData() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

initData();
initTransporter();

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 检查用户名是否合法（英文+数字+下划线，3-16位）
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

// ============ API 路由 ============

// 1. 发送验证码
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: '邮箱不能为空' });
    
    if (!/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email)) {
        return res.json({ success: false, message: '邮箱格式不正确' });
    }
    
    const code = generateCode();
    const expire = Date.now() + 10 * 60 * 1000;
    
    const data = readData();
    data.verificationCodes[email] = { code, expire };
    writeData(data);
    
    const result = await sendEmail(email, '【永恒森林】验证码', `您的验证码是：${code}，有效期10分钟`);
    
    if (result.success) {
        res.json({ success: true, message: '验证码已发送' });
    } else {
        res.json({ success: false, message: '邮件发送失败，请稍后重试' });
    }
});

// 2. 注册（同时申请白名单）
app.post('/api/auth/register', (req, res) => {
    const { username, email, password, code } = req.body;
    
    if (!username || !email || !password || !code) {
        return res.json({ success: false, message: '请填写完整信息' });
    }
    
    // 检查用户名格式（必须英文）
    if (!isValidUsername(username)) {
        return res.json({ success: false, message: '用户名必须为3-16位英文、数字或下划线' });
    }
    
    if (password.length < 6) {
        return res.json({ success: false, message: '密码至少6位' });
    }
    
    const data = readData();
    
    // 验证码校验
    const storedCode = data.verificationCodes[email];
    if (!storedCode || storedCode.code !== code || storedCode.expire < Date.now()) {
        return res.json({ success: false, message: '验证码错误或已过期' });
    }
    
    // 检查用户名是否已存在
    if (data.users.find(u => u.username === username)) {
        return res.json({ success: false, message: '用户名已存在' });
    }
    
    // 检查邮箱是否已注册
    if (data.users.find(u => u.email === email)) {
        return res.json({ success: false, message: '邮箱已注册' });
    }
    
    // 创建用户（未审核状态）
    const newUser = {
        id: Date.now(),
        username,
        email,
        password,
        status: 'pending',  // pending, approved, rejected
        registerDate: new Date().toISOString()
    };
    data.users.push(newUser);
    
    // 添加到白名单申请列表
    data.whitelistRequests.push({
        id: Date.now(),
        username,
        email,
        status: 'pending',
        requestDate: new Date().toISOString()
    });
    
    delete data.verificationCodes[email];
    writeData(data);
    
    // 通知管理员有新申请
    sendEmail('3632372460@qq.com', '【永恒森林】新白名单申请', `用户 ${username} (${email}) 申请白名单，请登录管理面板审核。`);
    
    res.json({ success: true, message: '注册成功！请等待管理员审核白名单。' });
});

// 3. 登录（检查白名单状态）
app.post('/api/auth/login', (req, res) => {
    const { account, password } = req.body;
    const data = readData();
    
    const user = data.users.find(u => (u.email === account || u.username === account) && u.password === password);
    
    if (!user) {
        return res.json({ success: false, message: '账号或密码错误' });
    }
    
    // 检查白名单状态
    const isInWhitelist = data.whitelist.includes(user.username);
    const hasRequest = data.whitelistRequests.find(r => r.username === user.username);
    
    if (!isInWhitelist) {
        let message = '你不在白名单中，';
        if (hasRequest && hasRequest.status === 'pending') {
            message += '你的申请正在审核中，请耐心等待。';
        } else if (hasRequest && hasRequest.status === 'rejected') {
            message += '你的申请已被拒绝，请联系管理员。';
        } else {
            message += '请先注册并等待管理员审核。';
        }
        return res.json({ success: false, message: message });
    }
    
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    res.json({
        success: true,
        token: token,
        user: { id: user.id, username: user.username, email: user.email, status: 'approved' }
    });
});

// 4. 获取公告（支持富文本）
app.get('/api/announcements', (req, res) => {
    const data = readData();
    res.json({ success: true, data: data.announcements });
});

// 5. 管理员登录
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === '20120619') {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: '密码错误' });
    }
});

// 6. 获取白名单申请列表
app.get('/api/admin/whitelist-requests', (req, res) => {
    if (req.query.admin !== 'true') return res.json({ success: false, message: '无权限' });
    const data = readData();
    res.json({ success: true, data: data.whitelistRequests });
});

// 7. 审核白名单申请
app.post('/api/admin/whitelist-review', (req, res) => {
    if (req.query.admin !== 'true') return res.json({ success: false, message: '无权限' });
    
    const { requestId, action } = req.body; // action: 'approve' 或 'reject'
    const data = readData();
    
    const request = data.whitelistRequests.find(r => r.id === parseInt(requestId));
    if (!request) {
        return res.json({ success: false, message: '申请不存在' });
    }
    
    if (action === 'approve') {
        request.status = 'approved';
        if (!data.whitelist.includes(request.username)) {
            data.whitelist.push(request.username);
        }
        // 更新用户状态
        const user = data.users.find(u => u.username === request.username);
        if (user) user.status = 'approved';
        
        sendEmail(request.email, '【永恒森林】白名单审核通过', `恭喜！你的账号 ${request.username} 已通过白名单审核，现在可以登录游戏了。`);
    } else if (action === 'reject') {
        request.status = 'rejected';
        sendEmail(request.email, '【永恒森林】白名单审核未通过', `很遗憾，你的账号 ${request.username} 未通过白名单审核，请联系管理员了解详情。`);
    }
    
    writeData(data);
    res.json({ success: true, message: action === 'approve' ? '已通过' : '已拒绝' });
});

// 8. 添加公告（支持HTML）
app.post('/api/admin/announcements', (req, res) => {
    if (req.query.admin !== 'true') return res.json({ success: false, message: '无权限' });
    
    const { title, content, type } = req.body;
    if (!title || !content) return res.json({ success: false, message: '标题和内容不能为空' });
    
    const data = readData();
    data.announcements.unshift({
        id: Date.now(),
        title,
        content,  // 支持HTML格式
        type: type || 'info',
        date: new Date().toISOString()
    });
    writeData(data);
    res.json({ success: true });
});

// 9. 删除公告
app.delete('/api/admin/announcements/:id', (req, res) => {
    if (req.query.admin !== 'true') return res.json({ success: false, message: '无权限' });
    
    const id = parseInt(req.params.id);
    const data = readData();
    const index = data.announcements.findIndex(a => a.id === id);
    if (index !== -1) {
        data.announcements.splice(index, 1);
        writeData(data);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: '公告不存在' });
    }
});

// 10. 提交举报
app.post('/api/report', async (req, res) => {
    const { player, reason, reporter } = req.body;
    if (!player || !reason) return res.json({ success: false, message: '请填写完整信息' });
    
    const content = `举报人：${reporter || '匿名'}\n违规玩家：${player}\n违规行为：${reason}\n时间：${new Date().toLocaleString()}`;
    await sendEmail('3632372460@qq.com', '【永恒森林】违规举报', content);
    
    const logFile = path.join(BASE_PATH, 'reports.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${reporter} 举报 ${player}: ${reason}\n`);
    res.json({ success: true, message: '举报已提交' });
});

// 11. 获取白名单列表
app.get('/api/whitelist', (req, res) => {
    const data = readData();
    res.json({ success: true, data: data.whitelist });
});

// 12. 意见反馈
app.post('/api/feedback', async (req, res) => {
    const { name, email, content, type } = req.body;
    
    if (!content) {
        return res.json({ success: false, message: '请填写反馈内容' });
    }
    
    const typeMap = {
        'bug': '🐛 BUG反馈',
        'suggest': '💡 建议',
        'other': '📝 其他',
        'general': '📋 一般'
    };
    
    const feedbackContent = `
        ========== 意见反馈 ==========
        反馈类型：${typeMap[type] || typeMap.general}
        联系人：${name || '匿名'}
        联系方式：${email || '未填写'}
        反馈内容：${content}
        提交时间：${new Date().toLocaleString()}
        ==============================
    `;
    
    // 发送邮件通知管理员
    await sendEmail('3632372460@qq.com', '【永恒森林】用户反馈', feedbackContent);
    
    // 保存到本地日志
    const logFile = path.join(BASE_PATH, 'feedbacks.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${name || '匿名'}: ${content}\n`);
    
    res.json({ success: true, message: '反馈已提交，感谢您的建议！' });
});

// 13. 获取反馈列表（管理员）
app.get('/api/admin/feedbacks', (req, res) => {
    if (req.query.admin !== 'true') return res.json({ success: false, message: '无权限' });
    
    const logFile = path.join(BASE_PATH, 'feedbacks.log');
    if (!fs.existsSync(logFile)) {
        return res.json({ success: true, data: [] });
    }
    
    const logs = fs.readFileSync(logFile, 'utf-8');
    const lines = logs.split('\n').filter(l => l.trim());
    const feedbacks = lines.map((line, index) => {
        const match = line.match(/\[(.*?)\]\s*(.*?):\s*(.*)/);
        if (match) {
            return { id: index, date: match[1], name: match[2], content: match[3] };
        }
        return { id: index, raw: line };
    }).reverse();
    
    res.json({ success: true, data: feedbacks });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║         永恒森林Wiki 服务器已启动                  ║
    ║                                                  ║
    ║     访问地址: http://localhost:${PORT}              ║
    ║     管理员密码: 20120619                          ║
    ║     数据路径: ${BASE_PATH}                         ║
    ║                                                  ║
    ║     白名单系统已启用！                             ║
    ║     新用户注册后需管理员审核                       ║
    ║     意见反馈功能已启用！                           ║
    ╚══════════════════════════════════════════════════╝
    `);
});
