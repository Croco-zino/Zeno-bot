import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let handler = async (m, { conn, args, text } = {}) => {
    if (!text?.trim()) {
        return m.reply(
            `📦 *Package Manager*\n\n` +
            `الاستخدام:\n` +
            `• .cmd axios\n` +
            `• .cmd axios chalk\n` +
            `• .cmd npm-check-updates\n\n` +
            `سيتم تنفيذ:\n` +
            `npm install <package>`
        );
    }

    // السماح بأسماء الباكيجات ونسخها و الـ scope فقط
    const packages = args.filter(pkg => !pkg.startsWith('-'));


    // منع أوامر shell إضافية
    const invalid = packages.some(pkg =>
        /[;&|`$()<>\\"'\s]/.test(pkg)
    );

    if (invalid) {
        return m.reply("❌ اسم الباكيج يحتوي على رموز غير مسموحة.");
    }

    const command = `npm install ${packages.join(" ")}`;

    await m.reply(
        `📦 *Installing Packages...*\n\n` +
        `\`\`\`${command}\`\`\`\n\n` +
        `⏳ جاري التنفيذ...`
    );

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: process.cwd(),
            timeout: 120000,
            maxBuffer: 1024 * 1024 * 5
        });

        let output = stdout || stderr || "تم التثبيت بنجاح.";

        if (output.length > 3500) {
            output = output.slice(-3500);
        }

        await m.reply(
            `✅ *Package Installation Finished*\n\n` +
            `📦 Packages:\n${packages.map(x => `• ${x}`).join("\n")}\n\n` +
            `\`\`\`\n${output}\n\`\`\``
        );

    } catch (error) {
        let output =
            error?.stdout ||
            error?.stderr ||
            error?.message ||
            "Unknown error";

        if (output.length > 3500) {
            output = output.slice(-3500);
        }

        await m.reply(
            `❌ *Package Installation Failed*\n\n` +
            `📦 Packages:\n${packages.map(x => `• ${x}`).join("\n")}\n\n` +
            `\`\`\`\n${output}\n\`\`\``
        );
    }
};

handler.help = ['cmd'];
handler.tags = ['owner'];
handler.command = /^(cmd)$/i;
handler.rowner = true;

export default handler;