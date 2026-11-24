package app.atelier.wardrobe;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Read-only provider that lets other apps (ChatGPT, WhatsApp…) open files the user chose to share. */
public class ShareProvider extends ContentProvider {
    static final String AUTHORITY = "app.atelier.wardrobe.share";

    File fileFor(Uri uri) throws FileNotFoundException {
        File dir = new File(getContext().getCacheDir(), "share");
        File f = new File(dir, uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment());
        try {
            if (!f.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) throw new FileNotFoundException("denied");
        } catch (IOException e) { throw new FileNotFoundException("denied"); }
        if (!f.exists()) throw new FileNotFoundException("missing");
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) { return MainActivity.mime(String.valueOf(uri.getLastPathSegment())); }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (FileNotFoundException e) { return null; }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
