import sqlite3

db_path = '/Users/kimtrungduong/Library/Application Support/zagi/zagi-tool.db'
print('Connecting to database:', db_path)

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Test proposed query with LEFT JOIN on contacts table
    query = """
        SELECT 
            pgm.member_id,
            COALESCE(NULLIF(pgm.display_name, ''), NULLIF(c.display_name, '')) AS display_name,
            COALESCE(NULLIF(pgm.avatar, ''), NULLIF(c.avatar_url, '')) AS avatar,
            pgm.role,
            pgm.updated_at
        FROM page_group_member pgm
        LEFT JOIN contacts c ON pgm.owner_zalo_id = c.owner_zalo_id AND pgm.member_id = c.contact_id
        WHERE pgm.owner_zalo_id = '266746582522774820' AND pgm.group_id = '1027841549708015828'
        ORDER BY pgm.role DESC
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    print("\nProposed Query Results (First 10):")
    for r in rows[:10]:
        print(dict(r))
        
    print("\nAny resolved names/avatars in the entire list?")
    resolved_count = 0
    for r in rows:
        if r['display_name'] != '':
            resolved_count += 1
            print(f"- UID: {r['member_id']}, Name: {r['display_name']}, Role: {r['role']}")
            
    print(f"Total resolved names in group: {resolved_count}/{len(rows)}")
    
    conn.close()
except Exception as e:
    print('Error running query:', e)
