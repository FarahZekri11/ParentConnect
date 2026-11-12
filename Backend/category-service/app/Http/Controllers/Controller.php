<?php

namespace App\Http\Controllers;

use OpenApi\Attributes as OA;

#[OA\Info(
    version: '1.0.0',
    title: 'ParentConnect - Community Service API',
    description: 'Microservice Communauté pour la plateforme ParentConnect : gestion des publications, questions, commentaires, catégories et signalements (modération).',
    contact: new OA\Contact(name: 'ParentConnect Community Team', email: 'dev@parentconnect.internal')
)]
#[OA\Server(url: '/', description: 'Community Service API Gateway / Direct Server')]
#[OA\SecurityScheme(
    securityScheme: 'bearerAuth',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'JWT émis par l\'Identity Service (claims : sub = user_id, role = PARENT|PROFESSIONAL|ADMIN)'
)]
#[OA\Tag(name: 'Health', description: 'Surveillance et état de santé du microservice')]
#[OA\Tag(name: 'Categories', description: 'Thématiques et catégories d\'échange')]
#[OA\Tag(name: 'Posts', description: 'Publications et questions posées par les parents')]
#[OA\Tag(name: 'Comments', description: 'Réponses et commentaires communautaires')]
#[OA\Tag(name: 'Reports', description: 'Signalements de contenus inappropriés')]
#[OA\Tag(name: 'Admin - Reports', description: 'Modération des signalements réservée au rôle ADMIN')]
abstract class Controller
{
    //
}
