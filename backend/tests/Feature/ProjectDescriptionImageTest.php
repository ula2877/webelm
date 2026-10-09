<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for the WYSIWYG description image upload + delete flow.
 *
 * There is NO metadata table for these images - the only "record" is the
 * <img src> URL stored inside tb_project.deskripsi. Deletion is therefore
 * guarded by (a) strict URL validation and (b) a usage check across all
 * project descriptions. These tests exercise both.
 *
 * Follows ProjectFileManagerTest: no DB refresh, every row/file created here
 * is cleaned up even when an assertion fails.
 */
class ProjectDescriptionImageTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk = 'public';
    private string $directory = 'project-description';

    /** @var string[] relative paths created during the test */
    private array $createdPaths = [];
    /** @var int[] project rows created during the test */
    private array $createdProjectIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        $user = DB::table('tb_user')->first();
        $this->actingAs(\App\Models\User::find($user->id_user));
    }

    protected function tearDown(): void
    {
        if (!empty($this->createdProjectIds)) {
            DB::table('tb_project')->whereIn('id_project', $this->createdProjectIds)->delete();
        }
        foreach ($this->createdPaths as $path) {
            Storage::disk($this->disk)->delete($path);
        }

        parent::tearDown();
    }

    private function relativeFromUrl(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $needle = '/storage/' . $this->directory . '/';
        $pos = strpos($path, $needle);
        $this->assertNotFalse($pos, "Unexpected storage URL: {$url}");

        return $this->directory . '/' . substr($path, $pos + strlen($needle));
    }

    /** Upload a real (tiny) PNG and remember it for cleanup. */
    private function uploadImage(): array
    {
        $file = UploadedFile::fake()->image('desc.png', 20, 20);
        $res = $this->postJson('/api/projects/description-image', ['file' => $file]);
        $res->assertStatus(201);
        $res->assertJsonPath('status', 'ok');

        $url = (string) $res->json('data.url');
        $relative = $this->relativeFromUrl($url);
        $this->createdPaths[] = $relative;

        return [$url, $relative];
    }

    private function deleteImages(array $urls)
    {
        return $this->postJson('/api/projects/description-image/delete', ['urls' => $urls]);
    }

    /** Create a real project whose description references the given HTML. */
    private function createProjectWithDescription(string $html): int
    {
        $clientId = DB::table('tb_user')->value('id_user');

        $res = $this->postJson('/api/projects', [
            'id_client' => (int) $clientId,
            'judul' => 'TEST DESCRIPTION IMAGE',
            'deskripsi' => $html,
            'tanggal_mulai' => '2026-01-01',
            'tanggal_estimasi' => '2026-01-31',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 0,
            'worker_ids' => [],
        ]);
        $res->assertStatus(201);

        $id = (int) $res->json('data.id');
        $this->createdProjectIds[] = $id;

        return $id;
    }

    public function test_upload_returns_app_storage_url()
    {
        [$url, $relative] = $this->uploadImage();

        $this->assertStringContainsString('/storage/' . $this->directory . '/', $url);
        $this->assertFileExists(Storage::disk($this->disk)->path($relative));

        echo "\n[TEST] description image upload OK\n";
    }

    public function test_delete_removes_unused_file()
    {
        [$url, $relative] = $this->uploadImage();

        $res = $this->deleteImages([$url]);
        $res->assertStatus(200);
        $res->assertJsonPath('status', 'ok');
        $this->assertContains($url, $res->json('data.deleted'));
        $this->assertFileDoesNotExist(Storage::disk($this->disk)->path($relative));

        echo "\n[TEST] delete unused description image OK\n";
    }

    public function test_delete_skips_file_still_referenced_then_deletes_after_removal()
    {
        [$url, $relative] = $this->uploadImage();

        $this->createProjectWithDescription('<p>foto</p><img src="' . $url . '" alt="">');

        // Still referenced -> file must survive.
        $res = $this->deleteImages([$url]);
        $res->assertStatus(200);
        $this->assertSame([], $res->json('data.deleted'));
        $this->assertSame('in_use', $res->json('data.skipped.0.reason'));
        $this->assertFileExists(Storage::disk($this->disk)->path($relative));

        // Remove the reference (delete the test project) -> now deletable.
        DB::table('tb_project')->whereIn('id_project', $this->createdProjectIds)->delete();
        $this->createdProjectIds = [];

        $res2 = $this->deleteImages([$url]);
        $res2->assertStatus(200);
        $this->assertContains($url, $res2->json('data.deleted'));
        $this->assertFileDoesNotExist(Storage::disk($this->disk)->path($relative));

        echo "\n[TEST] shared-usage guard OK\n";
    }

    public function test_delete_rejects_foreign_and_misplaced_urls()
    {
        $res = $this->deleteImages([
            'https://evil.example.com/storage/' . $this->directory . '/x.png',
            'http://127.0.0.1:9/storage/' . $this->directory . '/x.png',
            'https://' . (parse_url(Storage::disk($this->disk)->url(''), PHP_URL_HOST) ?: 'localhost')
                . '/storage/project-files/secret.pdf',
            '/storage/' . $this->directory . '/../../project-files/secret.pdf',
        ]);

        $res->assertStatus(200);
        $this->assertSame([], $res->json('data.deleted'));

        foreach ($res->json('data.skipped') as $skipped) {
            $this->assertSame('not_app_owned', $skipped['reason']);
        }

        echo "\n[TEST] foreign/traversal URL rejected OK\n";
    }

    public function test_delete_is_idempotent_for_missing_file()
    {
        $url = '/storage/' . $this->directory . '/project_desc_0_1_deadbeef.png';

        $res = $this->deleteImages([$url]);
        $res->assertStatus(200);
        $this->assertContains($url, $res->json('data.deleted'));

        echo "\n[TEST] idempotent delete OK\n";
    }

    public function test_delete_validates_input()
    {
        $this->postJson('/api/projects/description-image/delete', [])->assertStatus(422);
        $this->postJson('/api/projects/description-image/delete', ['urls' => 'bukan-array'])
            ->assertStatus(422);

        echo "\n[TEST] delete validation 422 OK\n";
    }

    public function test_unauthenticated_cannot_delete()
    {
        auth()->logout();

        $this->postJson('/api/projects/description-image/delete', ['urls' => []])
            ->assertStatus(401);

        echo "\n[TEST] unauthenticated delete 401 OK\n";
    }
}
