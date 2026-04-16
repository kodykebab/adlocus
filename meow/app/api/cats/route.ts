import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const catsDir = path.join(process.cwd(), 'public/cats');
        const files = fs.readdirSync(catsDir);
        // Filter out any non-image files just in case
        const catImages = files
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .map(f => `/cats/${f}`);
        return NextResponse.json({ cats: catImages });
    } catch (e: any) {
        console.error("API Error reading cats:", e);
        return NextResponse.json({ error: 'Failed to read cats directory' }, { status: 500 });
    }
}
