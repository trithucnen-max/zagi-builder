const Database = require('better-sqlite3');
const path = require('path');

const dbPath = '/Users/kimtrungduong/Library/Application Support/zagi/zagi-tool.db';
console.log('Connecting to database:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });
    
    // Check group members count
    const totalCount = db.prepare("SELECT COUNT(*) as count FROM page_group_member WHERE group_id = '1027841549708015828'").get();
    console.log('Total members in DB for group 1027841549708015828:', totalCount.count);
    
    // Sample some members
    const samples = db.prepare("SELECT member_id, display_name, avatar, role FROM page_group_member WHERE group_id = '1027841549708015828' LIMIT 10").all();
    console.log('Sample group members:');
    console.log(samples);
    
    // Check roles
    const roles = db.prepare("SELECT role, COUNT(*) as count FROM page_group_member WHERE group_id = '1027841549708015828' GROUP BY role").all();
    console.log('Role counts:');
    console.log(roles);
    
    // Check the specific admin and co-admins from the screenshot:
    // Creator: 3316791245510466704 (from the screenshot UI)
    // Co-admins: "266746582522774820", "5361380493671192816", "111329315376700900" (from the getGroupInfo response)
    const specificIds = ['3316791245510466704', '266746582522774820', '5361380493671192816', '111329315376700900'];
    const specificRows = db.prepare(`
        SELECT member_id, display_name, avatar, role 
        FROM page_group_member 
        WHERE group_id = '1027841549708015828' AND member_id IN (?, ?, ?, ?)
    `).all(specificIds[0], specificIds[1], specificIds[2], specificIds[3]);
    console.log('Specific members in page_group_member:', specificRows);

    // Let's also check if they exist in contacts table
    const contactRows = db.prepare(`
        SELECT contact_id, display_name, avatar_url, phone, contact_type
        FROM contacts
        WHERE contact_id IN (?, ?, ?, ?)
    `).all(specificIds[0], specificIds[1], specificIds[2], specificIds[3]);
    console.log('Specific members in contacts table:', contactRows);
    
    db.close();
} catch (err) {
    console.error('Error running query:', err);
}
