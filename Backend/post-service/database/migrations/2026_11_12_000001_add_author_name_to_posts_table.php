<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nom affiché de l'auteur (claim "name" du token Keycloak), pour afficher « Marie Lambert » plutôt qu'un identifiant.
 * Renseigné par le service à partir du token vérifié, jamais saisi par le client.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->string('author_name', 120)->nullable()->after('author_id');
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn('author_name');
        });
    }
};
