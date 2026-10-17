<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('author_id');
            $table->foreignId('category_id')->constrained('categories')->onDelete('cascade');
            $table->string('type')->default('post'); // 'post' | 'question'
            $table->string('title');
            $table->text('content');
            $table->string('status')->default('published'); // 'published' | 'hidden' | 'deleted'
            $table->timestamps();
            $table->softDeletes();

            $table->index('category_id');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
