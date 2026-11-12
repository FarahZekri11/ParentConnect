<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Photos jointes à une publication (URL relatives /api/posts/images/{fichier}, 4 au maximum).
 * Colonne facultative : les publications existantes sont conservées sans image.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->json('images')->nullable()->after('content');
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn('images');
        });
    }
};
